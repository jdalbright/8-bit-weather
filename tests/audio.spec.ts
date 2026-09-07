import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import type { Preferences, SceneState } from '../src/types';
import { welcomeScene } from '../src/lib/scene';
import { compositions } from '../src/audio/compositions';
import type { Mood } from '../src/audio/compositions';

const preferences: Preferences = {units:'imperial',music:true,ambience:true,effects:true,musicVolume:1,ambienceVolume:1,effectsVolume:1,reducedMotion:false};
type EngineProbe = {
  context: AudioContext; timer:number; tracks:{mood:Mood;step:number;gain:GainNode}[];
  music:GainNode; ambience:GainNode; effects:GainNode;
  configure:(preferences:Preferences,scene:SceneState)=>void;start:()=>Promise<void>;pause:()=>Promise<void>;
  effect:(type:string)=>void;dispose:()=>Promise<void>;schedule:()=>void;
};
type Harness = Window & { MeadowAudio:{WeatherAudio:new(preferences:Preferences,onState:()=>void)=>EngineProbe}; meadowEngine:EngineProbe };
let bundle:string;
test.beforeAll(async()=>{
  const output=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:resolve('src/audio/engine.ts'),formats:['iife'],name:'MeadowAudio'}}});
  const result=Array.isArray(output)?output[0]:output;
  if(!('output' in result)) throw new Error('Audio test bundle missing');
  bundle=result.output.find(item=>item.type==='chunk')!.code;
});

test('audio keeps its phrase on refresh, softens twilight, crossfades moods, and respects every channel',async({page})=>{
  await page.goto('/');await page.addScriptTag({content:bundle});
  await page.evaluate(({preferences})=>{
    const root=window as Harness;
    document.querySelector('.brand')!.addEventListener('click',()=>{
      root.meadowEngine=new root.MeadowAudio.WeatherAudio(preferences,()=>{});
      void root.meadowEngine.start();
    },{once:true});
  },{preferences});
  await page.getByRole('button',{name:'8-Bit Weather home'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as Harness).meadowEngine.tracks[0].step)).toBeGreaterThan(3);
  const before=await page.evaluate(()=>(window as Harness).meadowEngine.tracks[0].step);
  await page.evaluate(({preferences,scene})=>(window as Harness).meadowEngine.configure(preferences,scene),{preferences,scene:welcomeScene});
  expect(await page.evaluate(()=>(window as Harness).meadowEngine.tracks[0].step)).toBeGreaterThanOrEqual(before);
  expect(await page.evaluate(()=>(window as Harness).meadowEngine.tracks.length)).toBe(1);
  await page.evaluate(({preferences,scene})=>(window as Harness).meadowEngine.configure(preferences,{...scene,phase:'dusk',daylight:.8,transition:.2}),{preferences,scene:welcomeScene});
  await expect.poll(()=>page.evaluate(()=>(window as Harness).meadowEngine.music.gain.value)).toBeCloseTo(.29,2);
  await page.evaluate(({preferences,scene})=>(window as Harness).meadowEngine.configure(preferences,{...scene,kind:'storm',precipitationIntensity:1}),{preferences,scene:welcomeScene});
  expect(await page.evaluate(()=>(window as Harness).meadowEngine.tracks.length)).toBe(2);
  await expect.poll(()=>page.evaluate(()=>(window as Harness).meadowEngine.tracks.length)).toBe(1);
  expect(await page.evaluate(()=>(window as Harness).meadowEngine.tracks[0].mood)).toBe('storm');
  for(const channel of ['music','ambience','effects'] as const){
    await page.evaluate(({preferences,scene,channel})=>(window as Harness).meadowEngine.configure({...preferences,[channel]:false},{...scene,kind:'storm'}),{preferences,scene:welcomeScene,channel});
    await expect.poll(()=>page.evaluate(channel=>(window as Harness).meadowEngine[channel].gain.value,channel)).toBeCloseTo(0,3);
  }
  await page.evaluate(async()=>{const engine=(window as Harness).meadowEngine; await engine.pause();});
  expect(await page.evaluate(()=>(window as Harness).meadowEngine.context.state)).toBe('suspended');
  await page.evaluate(()=>(window as Harness).meadowEngine.dispose());
});

for(const mood of Object.keys(compositions) as Mood[]){
  test(`renders both ${mood} sections and their loop boundary without clipping`,async({page,browserName})=>{
    test.skip(browserName!=='chromium','Offline sample analysis uses Chromium; real-time controls also run in WebKit.');
    await page.goto('/');await page.addScriptTag({content:bundle});
    const seconds=128*30/compositions[mood].bpm+2;
    const report=await page.evaluate(async({preferences,scene,mood,seconds,bpm})=>{
      const root=window as Harness;
      const context=new OfflineAudioContext(1,Math.ceil(seconds*24000),24000);
      let clock=0;
      // Use the actual production synthesizer/scheduler with a deterministic offline clock.
      Object.defineProperty(context,'currentTime',{configurable:true,get:()=>clock});
      Object.defineProperty(context,'state',{configurable:true,get:()=> 'running'});
      Object.defineProperty(context,'resume',{configurable:true,value:async()=>{}});
      const Audio=window.AudioContext;
      window.AudioContext=function(){return context;} as unknown as typeof AudioContext;
      const engine=new root.MeadowAudio.WeatherAudio(preferences,()=>{});
      const kind=mood==='sunshine'||mood==='night'?'clear':mood==='clouds'?'cloudy':mood;
      engine.configure(preferences,{...scene,kind,isDay:mood!=='night',phase:mood==='night'?'night':'day',daylight:mood==='night'?0:1,precipitationIntensity:1});
      await engine.start();clearInterval(engine.timer);
      for(clock=0;clock<seconds;clock+=.04){engine.schedule();if(clock>3&&clock<3.2)engine.effect('river');}
      // Native offline rendering advances its own clock from here.
      delete (context as unknown as Record<string,unknown>).currentTime;
      delete (context as unknown as Record<string,unknown>).state;
      window.AudioContext=Audio;
      const buffer=await context.startRendering(), samples=buffer.getChannelData(0);
      let peak=0, energy=0, maxJump=0;
      for(let i=1;i<samples.length;i++){peak=Math.max(peak,Math.abs(samples[i]));energy+=samples[i]*samples[i];maxJump=Math.max(maxJump,Math.abs(samples[i]-samples[i-1]));}
      const boundaries=[32,64,96].map(step=>{
        const center=Math.floor((.06+step*30/bpm)*buffer.sampleRate);let sum=0;
        for(let i=center-1200;i<center+1200;i++)sum+=samples[i]*samples[i];
        return Math.sqrt(sum/2400);
      });
      return {peak,rms:Math.sqrt(energy/samples.length),maxJump,boundaries,steps:engine.tracks.at(-1)!.step};
    },{preferences,scene:welcomeScene,mood,seconds,bpm:compositions[mood].bpm});
    expect(report.steps).toBeGreaterThanOrEqual(128);
    expect(report.peak).toBeLessThan(.95);expect(report.rms).toBeGreaterThan(.001);
    expect(report.maxJump).toBeLessThan(.3);
    expect(report.boundaries.every(rms=>rms>.0001)).toBe(true);
    console.log(`${mood}: peak ${report.peak.toFixed(3)}, RMS ${report.rms.toFixed(3)}, max adjacent-sample change ${report.maxJump.toFixed(3)}`);
  });
}
