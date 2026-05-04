// ============================================================
// CousinServices — Base de Dados de Bairros/Regiões de SP
// Índice de liquidez: 1 (baixa) a 10 (altíssima demanda)
// Preço/m² médio de terrenos baseado em dados do mercado 2024-2025
// ============================================================

import { SPRegion } from '@/lib/types';

export const spRegions: SPRegion[] = [
  // === ZONA SUL ===
  { bairro: 'Itaim Bibi', zona: 'Sul', liquidez: 10, precoM2MedioTerreno: 22000, demandaAlta: true },
  { bairro: 'Vila Olímpia', zona: 'Sul', liquidez: 10, precoM2MedioTerreno: 20000, demandaAlta: true },
  { bairro: 'Moema', zona: 'Sul', liquidez: 9, precoM2MedioTerreno: 18500, demandaAlta: true },
  { bairro: 'Campo Belo', zona: 'Sul', liquidez: 8, precoM2MedioTerreno: 14000, demandaAlta: true },
  { bairro: 'Brooklin', zona: 'Sul', liquidez: 9, precoM2MedioTerreno: 16000, demandaAlta: true },
  { bairro: 'Santo Amaro', zona: 'Sul', liquidez: 7, precoM2MedioTerreno: 8500, demandaAlta: true },
  { bairro: 'Interlagos', zona: 'Sul', liquidez: 6, precoM2MedioTerreno: 4500, demandaAlta: false },
  { bairro: 'Grajaú', zona: 'Sul', liquidez: 4, precoM2MedioTerreno: 2200, demandaAlta: false },
  { bairro: 'Capela do Socorro', zona: 'Sul', liquidez: 5, precoM2MedioTerreno: 3000, demandaAlta: false },
  { bairro: 'Jardim São Luís', zona: 'Sul', liquidez: 4, precoM2MedioTerreno: 2500, demandaAlta: false },
  { bairro: 'Jabaquara', zona: 'Sul', liquidez: 7, precoM2MedioTerreno: 7500, demandaAlta: true },
  { bairro: 'Vila Mariana', zona: 'Sul', liquidez: 9, precoM2MedioTerreno: 17000, demandaAlta: true },
  { bairro: 'Saúde', zona: 'Sul', liquidez: 8, precoM2MedioTerreno: 11000, demandaAlta: true },

  // === ZONA OESTE ===
  { bairro: 'Pinheiros', zona: 'Oeste', liquidez: 10, precoM2MedioTerreno: 21000, demandaAlta: true },
  { bairro: 'Perdizes', zona: 'Oeste', liquidez: 9, precoM2MedioTerreno: 16500, demandaAlta: true },
  { bairro: 'Alto de Pinheiros', zona: 'Oeste', liquidez: 9, precoM2MedioTerreno: 19000, demandaAlta: true },
  { bairro: 'Butantã', zona: 'Oeste', liquidez: 7, precoM2MedioTerreno: 8000, demandaAlta: true },
  { bairro: 'Lapa', zona: 'Oeste', liquidez: 8, precoM2MedioTerreno: 10500, demandaAlta: true },
  { bairro: 'Vila Leopoldina', zona: 'Oeste', liquidez: 8, precoM2MedioTerreno: 11500, demandaAlta: true },
  { bairro: 'Jaguaré', zona: 'Oeste', liquidez: 6, precoM2MedioTerreno: 6500, demandaAlta: false },
  { bairro: 'Rio Pequeno', zona: 'Oeste', liquidez: 5, precoM2MedioTerreno: 5000, demandaAlta: false },
  { bairro: 'Raposo Tavares', zona: 'Oeste', liquidez: 5, precoM2MedioTerreno: 4500, demandaAlta: false },

  // === ZONA NORTE ===
  { bairro: 'Santana', zona: 'Norte', liquidez: 8, precoM2MedioTerreno: 10000, demandaAlta: true },
  { bairro: 'Tucuruvi', zona: 'Norte', liquidez: 7, precoM2MedioTerreno: 7000, demandaAlta: true },
  { bairro: 'Mandaqui', zona: 'Norte', liquidez: 6, precoM2MedioTerreno: 6500, demandaAlta: false },
  { bairro: 'Tremembé', zona: 'Norte', liquidez: 5, precoM2MedioTerreno: 4000, demandaAlta: false },
  { bairro: 'Casa Verde', zona: 'Norte', liquidez: 7, precoM2MedioTerreno: 7500, demandaAlta: true },
  { bairro: 'Vila Guilherme', zona: 'Norte', liquidez: 6, precoM2MedioTerreno: 6000, demandaAlta: false },
  { bairro: 'Jaçanã', zona: 'Norte', liquidez: 4, precoM2MedioTerreno: 3500, demandaAlta: false },
  { bairro: 'Brasilândia', zona: 'Norte', liquidez: 3, precoM2MedioTerreno: 2000, demandaAlta: false },
  { bairro: 'Freguesia do Ó', zona: 'Norte', liquidez: 6, precoM2MedioTerreno: 5500, demandaAlta: false },

  // === ZONA LESTE ===
  { bairro: 'Tatuapé', zona: 'Leste', liquidez: 9, precoM2MedioTerreno: 12000, demandaAlta: true },
  { bairro: 'Mooca', zona: 'Leste', liquidez: 9, precoM2MedioTerreno: 13000, demandaAlta: true },
  { bairro: 'Anália Franco', zona: 'Leste', liquidez: 9, precoM2MedioTerreno: 14500, demandaAlta: true },
  { bairro: 'Penha', zona: 'Leste', liquidez: 7, precoM2MedioTerreno: 6000, demandaAlta: true },
  { bairro: 'Vila Carrão', zona: 'Leste', liquidez: 7, precoM2MedioTerreno: 7000, demandaAlta: true },
  { bairro: 'Itaquera', zona: 'Leste', liquidez: 5, precoM2MedioTerreno: 3500, demandaAlta: false },
  { bairro: 'São Mateus', zona: 'Leste', liquidez: 4, precoM2MedioTerreno: 2500, demandaAlta: false },
  { bairro: 'Guaianases', zona: 'Leste', liquidez: 3, precoM2MedioTerreno: 1800, demandaAlta: false },
  { bairro: 'São Miguel Paulista', zona: 'Leste', liquidez: 4, precoM2MedioTerreno: 2200, demandaAlta: false },
  { bairro: 'Ermelino Matarazzo', zona: 'Leste', liquidez: 4, precoM2MedioTerreno: 2800, demandaAlta: false },
  { bairro: 'Vila Matilde', zona: 'Leste', liquidez: 6, precoM2MedioTerreno: 5500, demandaAlta: false },
  { bairro: 'Aricanduva', zona: 'Leste', liquidez: 5, precoM2MedioTerreno: 4000, demandaAlta: false },

  // === CENTRO ===
  { bairro: 'República', zona: 'Centro', liquidez: 7, precoM2MedioTerreno: 15000, demandaAlta: true },
  { bairro: 'Sé', zona: 'Centro', liquidez: 6, precoM2MedioTerreno: 12000, demandaAlta: false },
  { bairro: 'Liberdade', zona: 'Centro', liquidez: 8, precoM2MedioTerreno: 14000, demandaAlta: true },
  { bairro: 'Bela Vista', zona: 'Centro', liquidez: 8, precoM2MedioTerreno: 16000, demandaAlta: true },
  { bairro: 'Consolação', zona: 'Centro', liquidez: 9, precoM2MedioTerreno: 18000, demandaAlta: true },

  // === REGIÃO METROPOLITANA ===
  { bairro: 'Guarulhos', zona: 'Metropolitana', liquidez: 6, precoM2MedioTerreno: 3500, demandaAlta: false },
  { bairro: 'Osasco', zona: 'Metropolitana', liquidez: 7, precoM2MedioTerreno: 5000, demandaAlta: true },
  { bairro: 'São Bernardo do Campo', zona: 'Metropolitana', liquidez: 7, precoM2MedioTerreno: 5500, demandaAlta: true },
  { bairro: 'Santo André', zona: 'Metropolitana', liquidez: 7, precoM2MedioTerreno: 5000, demandaAlta: true },
  { bairro: 'São Caetano do Sul', zona: 'Metropolitana', liquidez: 8, precoM2MedioTerreno: 8000, demandaAlta: true },
  { bairro: 'Diadema', zona: 'Metropolitana', liquidez: 5, precoM2MedioTerreno: 3000, demandaAlta: false },
  { bairro: 'Mauá', zona: 'Metropolitana', liquidez: 4, precoM2MedioTerreno: 2500, demandaAlta: false },
  { bairro: 'Cotia', zona: 'Metropolitana', liquidez: 5, precoM2MedioTerreno: 3200, demandaAlta: false },
  { bairro: 'Barueri', zona: 'Metropolitana', liquidez: 7, precoM2MedioTerreno: 6000, demandaAlta: true },
  { bairro: 'Alphaville', zona: 'Metropolitana', liquidez: 9, precoM2MedioTerreno: 9500, demandaAlta: true },
  { bairro: 'Taboão da Serra', zona: 'Metropolitana', liquidez: 5, precoM2MedioTerreno: 3500, demandaAlta: false },
  { bairro: 'Carapicuíba', zona: 'Metropolitana', liquidez: 4, precoM2MedioTerreno: 2200, demandaAlta: false },
];

export function getRegionByBairro(bairro: string): SPRegion | undefined {
  return spRegions.find(r =>
    r.bairro.toLowerCase() === bairro.toLowerCase()
  );
}

export function getRegionsByZona(zona: string): SPRegion[] {
  if (zona === 'Todas' || !zona) return spRegions;
  return spRegions.filter(r => r.zona === zona);
}

export function getAllBairros(): string[] {
  return spRegions.map(r => r.bairro).sort();
}

export function getAllZonas(): string[] {
  return ['Todas', 'Norte', 'Sul', 'Leste', 'Oeste', 'Centro', 'Metropolitana'];
}
