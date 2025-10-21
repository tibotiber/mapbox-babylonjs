import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";

import "./style.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div id="map"></div>
`;

const map = new mapboxgl.Map({
  container: "map",
  // Choose from Mapbox's core styles, or make your own style with Mapbox Studio
  style: "mapbox://styles/mapbox/standard",
  config: {
    basemap: {
      theme: "monochrome",
    },
  },
  zoom: 18,
  center: [148.9819, -35.3981],
  pitch: 60,
  antialias: true, // create the gl context with MSAA antialiasing, so custom layers are antialiased
});
