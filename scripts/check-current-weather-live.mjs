// Explicit, bounded live audit. Never part of the offline unit-test command.
// Uses the production normalized current response as the provider input, and the
// exact new server radar/reconciliation functions. No provider keys are required.
/* global fetch, AbortSignal */
import process from 'node:process';
import console from 'node:console';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, URL, URLSearchParams } from 'node:url';
import ts from 'typescript';

const output = resolve(process.argv[2] ?? `docs/evidence/weather-live-${new Date().toISOString().slice(0,10)}`);
await mkdir(output,{recursive:true});
const compiled = await mkdtemp(join(tmpdir(),'weather-live-'));
try {
  await writeFile(join(compiled,'package.json'),' {"type":"module"}');
  for (const file of ['server/current-precipitation.ts','src/lib/weather.ts']) {
    const source = await readFile(file,'utf8');
    const destination = join(compiled,file.replace(/\.ts$/,'.js'));
    await mkdir(resolve(destination,'..'),{recursive:true});
    await writeFile(destination,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}).outputText);
  }
  const {fetchCurrentPrecipitation,reconcileCurrentPrecipitation} = await import(pathToFileURL(join(compiled,'server/current-precipitation.js')));
  const stations = process.argv[3] ? JSON.parse(await readFile(process.argv[3],'utf8')) : [
    ['Raleigh',35.7796,-78.6382], ['KORF',36.9037,-76.1927],
    ['KGNV',29.6917,-82.276], ['KAVL',35.4318,-82.5379],
  ];
  if (!Array.isArray(stations) || stations.length > 6 || stations.some(s=>!Array.isArray(s) || !/^[A-Za-z0-9_-]+$/.test(s[0]) || !Number.isFinite(s[1]) || !Number.isFinite(s[2]))) throw new Error('Provide at most six named coordinates');
  const nativeFetch = globalThis.fetch;
  let radarRequest = 0;
  globalThis.fetch = async (input, options) => {
    if (new URL(input).hostname !== 'opengeo.ncep.noaa.gov') return nativeFetch(input,options);
    const id = ++radarRequest, startedAt = new Date().toISOString();
    try {
      const response = await nativeFetch(input,options);
      const body = await response.clone().text();
      await writeFile(join(output,`noaa-request-${id}.json`),JSON.stringify({url:String(input),startedAt,completedAt:new Date().toISOString(),status:response.status,body},null,2)+'\n');
      return response;
    } catch(error) {
      await writeFile(join(output,`noaa-request-${id}.json`),JSON.stringify({url:String(input),startedAt,error:String(error)},null,2)+'\n');
      throw error;
    }
  };
  const report = {startedAt:new Date().toISOString(),method:'Live production provider input plus the local server NOAA reconciliation; not a deployed fix.',comparisons:[]};
  const ids = stations.map(s=>s[0]==='Raleigh'?'KRDU':s[0]).join(',');
  const metarUrl = `https://aviationweather.gov/api/data/metar?${new URLSearchParams({ids,format:'json',hours:'1'})}`;
  const metars = await fetch(metarUrl,{signal:AbortSignal.timeout(15000)});
  if (!metars.ok) throw new Error(`NOAA observations: HTTP ${metars.status}`);
  await writeFile(join(output,'metars.json'),JSON.stringify(await metars.json(),null,2)+'\n');
  for (const [name,latitude,longitude] of stations) {
    const url = `https://8-bit-weather.vercel.app/api/weather?${new URLSearchParams({latitude:String(latitude),longitude:String(longitude),section:'current'})}`;
    const startedAt = new Date().toISOString();
    const [response,radar] = await Promise.all([fetch(url,{signal:AbortSignal.timeout(15000)}),fetchCurrentPrecipitation(latitude,longitude)]);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}; stopped to avoid retries/quota use`);
    const part = await response.json();
    if (!part.current || part.provider!=='xweather') throw new Error('Unexpected provider contract');
    const after = reconcileCurrentPrecipitation(part.current,radar);
    const comparison = {name,latitude,longitude,url,startedAt,completedAt:new Date().toISOString(),provider:part,radar,after};
    report.comparisons.push(comparison);
    await writeFile(join(output,`${name.toLowerCase()}.json`),JSON.stringify(comparison,null,2)+'\n');
    console.log(`${name}: ${part.current.conditionLabel}, ${part.current.precipitationProbability}% -> ${after.conditionLabel}; radar ${radar?.kind??'no usable positive evidence'}`);
  }
  const original = JSON.parse(await readFile('docs/evidence/weather-live-2026-09-12/app-raleigh-earlier-zero.json','utf8'));
  const incident = JSON.parse(await readFile('docs/evidence/weather-fix-2026-09-13/incident-radar.json','utf8'));
  const replay = reconcileCurrentPrecipitation(original.current,incident.correctionInput,original.updatedAt);
  if (replay.code!==63 || replay.conditionLabel!=='Rain on radar' || replay.precipitationProbability!==null) throw new Error('Original incident replay failed');
  report.incidentReplay = {input:original.current,archive:incident.source,after:replay,evaluatedAt:new Date(original.updatedAt).toISOString()};
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('Original incident replay: Overcast / 0% -> Rain on radar / no invented probability.');
} finally { await rm(compiled,{recursive:true,force:true}); }
