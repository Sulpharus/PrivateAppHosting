import 'leaflet';

declare module 'leaflet' {
  interface HeatLayerOptions {
    radius?: number;
    blur?: number;
    maxZoom?: number;
    max?: number;
    minOpacity?: number;
  }
  function heatLayer(latlngs: [number, number, number?][], options?: HeatLayerOptions): Layer;
}
