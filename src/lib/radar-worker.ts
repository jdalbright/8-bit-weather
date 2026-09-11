// Vite bundles this worker and its dependencies locally for capacitor:// as well as HTTPS.
import RadarWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs';
// Referencing the export prevents the package's sideEffects flag from removing its entry.
// The upstream entry initializes itself in a Worker; do not initialize it twice.
const scope = self as typeof self & { worker?: RadarWorker };
scope.worker ??= new RadarWorker(self);
