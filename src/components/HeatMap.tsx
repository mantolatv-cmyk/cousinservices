'use client';

import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { AuctionLot } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/format';

// Approximate coordinates for SP regions
const REGION_COORDS: Record<string, [number, number]> = {
  // Capital - Zonas
  'Itaim Bibi': [-23.5834, -46.6728], 'Vila Olímpia': [-23.5955, -46.6770],
  'Moema': [-23.6012, -46.6635], 'Campo Belo': [-23.6213, -46.6617],
  'Brooklin': [-23.6118, -46.6893], 'Santo Amaro': [-23.6513, -46.7103],
  'Interlagos': [-23.7067, -46.6905], 'Grajaú': [-23.7567, -46.6680],
  'Jabaquara': [-23.6370, -46.6426], 'Vila Mariana': [-23.5863, -46.6346],
  'Pinheiros': [-23.5631, -46.6920], 'Perdizes': [-23.5345, -46.6835],
  'Butantã': [-23.5711, -46.7232], 'Lapa': [-23.5178, -46.7019],
  'Santana': [-23.5054, -46.6283], 'Tucuruvi': [-23.4812, -46.6100],
  'Casa Verde': [-23.5068, -46.6530], 'Tatuapé': [-23.5412, -46.5764],
  'Mooca': [-23.5573, -46.6013], 'Penha': [-23.5204, -46.5400],
  'Itaquera': [-23.5369, -46.4536], 'República': [-23.5435, -46.6423],
  'Liberdade': [-23.5582, -46.6364], 'Consolação': [-23.5489, -46.6583],
  // Metropolitana
  'Guarulhos': [-23.4538, -46.5333], 'Osasco': [-23.5325, -46.7917],
  'São Bernardo do Campo': [-23.6914, -46.5647], 'Santo André': [-23.6737, -46.5432],
  'São Caetano do Sul': [-23.6217, -46.5550], 'Barueri': [-23.5100, -46.8760],
  'Alphaville': [-23.4860, -46.8489],
  // Interior
  'Campinas': [-22.9056, -47.0608], 'Sorocaba': [-23.5015, -47.4526],
  'Ribeirão Preto': [-21.1767, -47.8208], 'Santos': [-23.9608, -46.3336],
  'Jundiaí': [-23.1857, -46.8978], 'Bragança Paulista': [-22.9529, -46.5425],
  'Atibaia': [-23.1167, -46.5558],
  // Default SP center
  'São Paulo': [-23.5505, -46.6333],
};

function getCoords(lot: AuctionLot): [number, number] | null {
  // Try bairro first, then cidade
  const bairro = lot.bairro?.split('\n')[0]?.trim();
  if (bairro && REGION_COORDS[bairro]) return REGION_COORDS[bairro];
  const cidade = lot.cidade?.trim();
  if (cidade && REGION_COORDS[cidade]) return REGION_COORDS[cidade];
  // Fuzzy match
  for (const [key, val] of Object.entries(REGION_COORDS)) {
    if (bairro?.toLowerCase().includes(key.toLowerCase()) ||
        cidade?.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return null;
}

function getROIColor(roi: number): string {
  if (roi >= 200) return '#00FFA3';
  if (roi >= 100) return '#00E0FF';
  if (roi >= 50) return '#FFB800';
  return '#FF3366';
}

interface HeatMapProps {
  lots: AuctionLot[];
}

export default function HeatMap({ lots }: HeatMapProps) {
  const mappable = lots
    .map(lot => ({ lot, coords: getCoords(lot) }))
    .filter((x): x is { lot: AuctionLot; coords: [number, number] } => x.coords !== null);

  if (mappable.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: '13px' }}>
        📍 Nenhum terreno com localização mapeável encontrado.
      </div>
    );
  }

  return (
    <MapContainer
      center={[-23.5505, -46.6333]}
      zoom={9}
      style={{ height: '400px', width: '100%', borderRadius: '12px' }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {mappable.map(({ lot, coords }, idx) => {
        const roi = lot.analysis?.roiEstimado || 0;
        const color = getROIColor(roi);
        const radius = Math.min(Math.max(roi / 20, 6), 20);
        return (
          <CircleMarker
            key={`marker-${lot.id}-${idx}`}
            center={coords}
            radius={radius}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.7,
              color: color,
              weight: 2,
              opacity: 0.9,
            }}
          >
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', lineHeight: 1.5, minWidth: '200px' }}>
                <strong style={{ fontSize: '13px' }}>{lot.bairro?.split('\n')[0]}</strong>
                <br />
                <span style={{ color: '#64748B' }}>{lot.cidade}/{lot.estado}</span>
                <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid #E2E8F0' }} />
                <div>📐 Área: <strong>{lot.areaM2?.toLocaleString('pt-BR')}m²</strong></div>
                <div>💰 Lance: <strong>{formatCurrency(lot.lanceInicial)}</strong></div>
                <div>📊 ROI: <strong style={{ color }}>{formatPercent(roi)}</strong></div>
                <div>📉 Deságio: <strong>{formatPercent(lot.analysis?.desagio || 0)}</strong></div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
