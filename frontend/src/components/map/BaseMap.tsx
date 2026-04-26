import { MapContainer, TileLayer } from "react-leaflet";
import type { ReactNode } from "react";
import L from "leaflet";

const ALMATY_CENTER: [number, number] = [43.238, 76.946];
const ALMATY_BOUNDS: L.LatLngBoundsExpression = [[43.08, 76.6], [43.45, 77.2]];

// Carto Voyager — светлая, с топонимами и лёгкими цветными акцентами.
// Отлично читается, цветные маркеры/круги выделяются поверх.
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const LIGHT_ATTRIB = '&copy; OSM &copy; <a href="https://carto.com/attributions">CARTO</a>';

interface Props { children?: ReactNode; zoom?: number; }

export default function BaseMap({ children, zoom = 12 }: Props) {
  return (
    <MapContainer
      center={ALMATY_CENTER}
      zoom={zoom}
      minZoom={10}
      maxZoom={18}
      maxBounds={ALMATY_BOUNDS}
      scrollWheelZoom
      preferCanvas
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer attribution={LIGHT_ATTRIB} url={LIGHT_TILES} />
      {children}
    </MapContainer>
  );
}
