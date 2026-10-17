import { PlayableBoundary } from '../types';

export type MetricCategory = 'rooms' | 'mobilia' | 'luz_deco' | 'avatar_item' | 'macro';

export interface MetricPresetItem {
  id: string;
  name: string;
  category: MetricCategory;
  targetHeight: number; // in meters (Y)
  baseDimensions?: string; // e.g. "4 × 5 m" or "1,80 × 0,90 m"
  boundary?: { x: number; y: number; z: number };
  capacity?: string;
  tip?: string;
  icon?: string;
}

export interface MetricCategoryInfo {
  id: MetricCategory;
  label: string;
  icon: string;
  description: string;
}

export const METRIC_CATEGORIES: MetricCategoryInfo[] = [
  {
    id: 'rooms',
    label: 'Rooms / Casas',
    icon: '🏠',
    description: 'Encaixa pelo teto / pé-direito e ajusta o limite jogável',
  },
  {
    id: 'mobilia',
    label: 'Mobília',
    icon: '🛋️',
    description: 'Encaixa pela altura de uso e ergonomia humana',
  },
  {
    id: 'luz_deco',
    label: 'Luz / Decoração',
    icon: '💡',
    description: 'Luminárias, abajures, quadros e adereços cenográficos',
  },
  {
    id: 'avatar_item',
    label: 'Avatar / Roupa / Item',
    icon: '👤',
    description: 'Proporções anatômicas corporais (base 1,70 m)',
  },
  {
    id: 'macro',
    label: 'Macro & Estruturas',
    icon: '🚗',
    description: 'Veículos, edifícios, armazéns e mega estruturas',
  },
];

export const METRIC_PRESETS: MetricPresetItem[] = [
  // ==========================================
  // 1. ROOMS / CASAS (Encaixa pelo teto)
  // ==========================================
  {
    id: 'room_pequena',
    name: 'Room Pequena',
    category: 'rooms',
    targetHeight: 2.50,
    baseDimensions: '4 × 5 m',
    boundary: { x: 4.0, y: 2.50, z: 5.0 },
    capacity: '2–4 pessoas',
    tip: 'Teto 2,50 m · Limite jogável 4 × 5 m',
    icon: '🏠',
  },
  {
    id: 'room_media',
    name: 'Room Média',
    category: 'rooms',
    targetHeight: 2.80,
    baseDimensions: '6 × 8 m',
    boundary: { x: 6.0, y: 2.80, z: 8.0 },
    capacity: '6–8 pessoas',
    tip: 'Teto 2,80 m · Limite jogável 6 × 8 m (Padrão)',
    icon: '🏠',
  },
  {
    id: 'room_grande',
    name: 'Room Grande',
    category: 'rooms',
    targetHeight: 3.20,
    baseDimensions: '8 × 12 m',
    boundary: { x: 8.0, y: 3.20, z: 12.0 },
    capacity: '10–16 pessoas',
    tip: 'Teto 3,20 m · Limite jogável 8 × 12 m',
    icon: '🏛️',
  },
  {
    id: 'casa_comum',
    name: 'Casa Comum',
    category: 'rooms',
    targetHeight: 2.80,
    baseDimensions: '8 × 10 m',
    boundary: { x: 8.0, y: 2.80, z: 10.0 },
    tip: 'Teto 2,80 m (pé-direito) · 8 × 10 m',
    icon: '🏡',
  },
  {
    id: 'casa_sobrado',
    name: 'Casa Sobrado',
    category: 'rooms',
    targetHeight: 5.60,
    baseDimensions: '8 × 10 m',
    boundary: { x: 8.0, y: 5.60, z: 10.0 },
    tip: 'Teto 5,60 m (2 pisos) · 8 × 10 m',
    icon: '🏘️',
  },
  {
    id: 'mansao_hall',
    name: 'Mansão / Hall',
    category: 'rooms',
    targetHeight: 5.00,
    baseDimensions: '12 × 18 m',
    boundary: { x: 12.0, y: 5.00, z: 18.0 },
    tip: 'Teto 5,00 m (4,50–6,00 m) · 12 × 18 m',
    icon: '🏰',
  },
  {
    id: 'corredor',
    name: 'Corredor',
    category: 'rooms',
    targetHeight: 2.50,
    baseDimensions: '1,2 × 6 m',
    boundary: { x: 1.2, y: 2.50, z: 6.0 },
    tip: 'Teto 2,50 m · 1,2 × 6 m',
    icon: '🚪',
  },

  // ==========================================
  // 2. MOBÍLIA (Encaixa pela altura de uso)
  // ==========================================
  {
    id: 'puff',
    name: 'Puff',
    category: 'mobilia',
    targetHeight: 0.35,
    baseDimensions: '0,60 × 0,60 m',
    tip: 'Alvo 0,35 m · Base 0,60 × 0,60 m',
    icon: '🛋️',
  },
  {
    id: 'sofa_assento',
    name: 'Sofá (Assento)',
    category: 'mobilia',
    targetHeight: 0.43,
    baseDimensions: '1,80 × 0,90 m',
    tip: 'Alvo assento 0,43 m · Base 1,80 × 0,90 m',
    icon: '🛋️',
  },
  {
    id: 'sofa_completo',
    name: 'Sofá (Total / Encosto)',
    category: 'mobilia',
    targetHeight: 0.85,
    baseDimensions: '1,80 × 0,90 m',
    tip: 'Alvo encosto 0,85 m · Base 1,80 × 0,90 m',
    icon: '🛋️',
  },
  {
    id: 'cadeira',
    name: 'Cadeira',
    category: 'mobilia',
    targetHeight: 0.45,
    baseDimensions: '0,50 × 0,50 m',
    tip: 'Alvo assento 0,45 m · Base 0,50 × 0,50 m',
    icon: '🪑',
  },
  {
    id: 'mesa_centro',
    name: 'Mesa de Centro',
    category: 'mobilia',
    targetHeight: 0.40,
    baseDimensions: '1,20 × 0,60 m',
    tip: 'Alvo 0,40 m · Base 1,20 × 0,60 m',
    icon: '☕',
  },
  {
    id: 'mesa_jantar',
    name: 'Mesa de Jantar',
    category: 'mobilia',
    targetHeight: 0.75,
    baseDimensions: '1,60 × 0,90 m',
    tip: 'Alvo 0,75 m · Base 1,60 × 0,90 m',
    icon: '🍽️',
  },
  {
    id: 'bancada_balcao',
    name: 'Bancada / Balcão',
    category: 'mobilia',
    targetHeight: 0.90,
    tip: 'Alvo 0,90 m altura ergonômica',
    icon: '🍸',
  },
  {
    id: 'cama_colchao',
    name: 'Cama (Colchão)',
    category: 'mobilia',
    targetHeight: 0.50,
    baseDimensions: '1,60 × 2,00 m',
    tip: 'Alvo colchão 0,50 m · Base 1,60 × 2,00 m',
    icon: '🛏️',
  },
  {
    id: 'cama_cabeceira',
    name: 'Cama + Cabeceira',
    category: 'mobilia',
    targetHeight: 1.00,
    baseDimensions: '1,60 × 2,10 m',
    tip: 'Alvo cabeceira 1,00 m · Base 1,60 × 2,10 m',
    icon: '🛏️',
  },
  {
    id: 'guarda_roupa',
    name: 'Guarda-Roupa',
    category: 'mobilia',
    targetHeight: 2.10,
    baseDimensions: '1,80 × 0,60 m',
    tip: 'Alvo 2,10 m · Base 1,80 × 0,60 m',
    icon: '🚪',
  },
  {
    id: 'estante',
    name: 'Estante',
    category: 'mobilia',
    targetHeight: 1.80,
    baseDimensions: '0,80 × 0,35 m',
    tip: 'Alvo 1,80 m · Base 0,80 × 0,35 m',
    icon: '📚',
  },
  {
    id: 'porta',
    name: 'Porta',
    category: 'mobilia',
    targetHeight: 2.10,
    baseDimensions: '0,90 m largura',
    tip: 'Alvo 2,10 m · Largura 0,90 m',
    icon: '🚪',
  },
  {
    id: 'janela_peitoril',
    name: 'Janela (Peitoril)',
    category: 'mobilia',
    targetHeight: 1.00,
    tip: 'Alvo 1,00 m peitoril padrão',
    icon: '🪟',
  },

  // ==========================================
  // 3. LUZ / DECO
  // ==========================================
  {
    id: 'abajur_mesa',
    name: 'Abajur de Mesa',
    category: 'luz_deco',
    targetHeight: 0.45,
    tip: 'Alvo 0,45 m',
    icon: '💡',
  },
  {
    id: 'abajur_chao',
    name: 'Abajur de Chão',
    category: 'luz_deco',
    targetHeight: 1.50,
    tip: 'Alvo 1,50 m',
    icon: '🛋️',
  },
  {
    id: 'luminaria_pendente',
    name: 'Luminária Pendente',
    category: 'luz_deco',
    targetHeight: 0.40,
    tip: 'Corpo 0,30–0,50 m + fio até ~2,20m do chão',
    icon: '💡',
  },
  {
    id: 'vela_copo',
    name: 'Vela / Copo',
    category: 'luz_deco',
    targetHeight: 0.12,
    tip: 'Alvo 0,12 m',
    icon: '🕯️',
  },
  {
    id: 'quadro',
    name: 'Quadro Decorativo',
    category: 'luz_deco',
    targetHeight: 0.70,
    tip: 'Lado 0,70 m',
    icon: '🖼️',
  },
  {
    id: 'tapete',
    name: 'Tapete',
    category: 'luz_deco',
    targetHeight: 0.02,
    tip: 'Alvo 0,02 m (quase chão)',
    icon: '🧶',
  },
  {
    id: 'planta_vaso',
    name: 'Planta em Vaso',
    category: 'luz_deco',
    targetHeight: 1.20,
    tip: 'Alvo 1,20 m',
    icon: '🪴',
  },
  {
    id: 'tv_55',
    name: 'TV (55")',
    category: 'luz_deco',
    targetHeight: 0.70,
    tip: 'Alvo 0,70 m (tela 55 polegadas)',
    icon: '📺',
  },

  // ==========================================
  // 4. AVATAR / ROUPA / ITEM (Corpo 1,70 m)
  // ==========================================
  {
    id: 'avatar_adulto',
    name: 'Avatar Adulto',
    category: 'avatar_item',
    targetHeight: 1.70,
    tip: 'Alvo 1,70 m (Padrão Humano de Referência)',
    icon: '👤',
  },
  {
    id: 'avatar_baixo',
    name: 'Avatar Baixo',
    category: 'avatar_item',
    targetHeight: 1.55,
    tip: 'Alvo 1,55 m',
    icon: '👤',
  },
  {
    id: 'avatar_alto',
    name: 'Avatar Alto',
    category: 'avatar_item',
    targetHeight: 1.85,
    tip: 'Alvo 1,85 m',
    icon: '👤',
  },
  {
    id: 'crianca',
    name: 'Criança',
    category: 'avatar_item',
    targetHeight: 1.20,
    tip: 'Alvo 1,20 m',
    icon: '🧒',
  },
  {
    id: 'chapeu_bone',
    name: 'Chapéu / Boné',
    category: 'avatar_item',
    targetHeight: 0.15,
    tip: 'Alvo 0,15 m (0,12–0,18 m)',
    icon: '🧢',
  },
  {
    id: 'coroa',
    name: 'Coroa',
    category: 'avatar_item',
    targetHeight: 0.15,
    tip: 'Alvo 0,15 m',
    icon: '👑',
  },
  {
    id: 'oculos',
    name: 'Óculos',
    category: 'avatar_item',
    targetHeight: 0.04,
    tip: 'Alvo 0,04 m (altura da armação)',
    icon: '👓',
  },
  {
    id: 'camisa_jaqueta',
    name: 'Camisa / Jaqueta',
    category: 'avatar_item',
    targetHeight: 0.70,
    tip: 'Alvo ~0,70 m (ombro à barra)',
    icon: '👕',
  },
  {
    id: 'calca',
    name: 'Calça',
    category: 'avatar_item',
    targetHeight: 1.00,
    tip: 'Alvo ~1,00 m',
    icon: '👖',
  },
  {
    id: 'sapato',
    name: 'Sapato / Calçado',
    category: 'avatar_item',
    targetHeight: 0.12,
    tip: 'Alvo 0,12 m',
    icon: '👟',
  },
  {
    id: 'colar',
    name: 'Colar',
    category: 'avatar_item',
    targetHeight: 0.40,
    tip: 'Comprimento 0,40 m × 0,02 m',
    icon: '📿',
  },
  {
    id: 'anel',
    name: 'Anel',
    category: 'avatar_item',
    targetHeight: 0.02,
    tip: 'Alvo 0,02 m',
    icon: '💍',
  },

  // ==========================================
  // 5. VEÍCULOS & MACRO ESTRUTURAS
  // ==========================================
  {
    id: 'carro',
    name: 'Carro',
    category: 'macro',
    targetHeight: 1.50,
    baseDimensions: '1,80 × 4,50 m',
    tip: 'Alvo 1,50 m · Comprimento ~4,50 m · Largura ~1,80 m',
    icon: '🚗',
  },
  {
    id: 'predio',
    name: 'Prédio / Edifício',
    category: 'macro',
    targetHeight: 20.00,
    baseDimensions: '12 × 15 m',
    boundary: { x: 25.0, y: 20.00, z: 25.0 },
    tip: 'Alvo 20,00 m (15–30 m de altura)',
    icon: '🏢',
  },
  {
    id: 'armazem',
    name: 'Armazém / Galpão',
    category: 'macro',
    targetHeight: 7.00,
    baseDimensions: '20 × 30 m',
    boundary: { x: 20.0, y: 7.00, z: 30.0 },
    tip: 'Alvo 7,00 m · Área ~20 × 30 m',
    icon: '🏭',
  },
  {
    id: 'estadio_futebol',
    name: 'Estádio de Futebol',
    category: 'macro',
    targetHeight: 25.00,
    baseDimensions: '80 × 120 m',
    boundary: { x: 80.0, y: 25.00, z: 120.0 },
    tip: 'Alvo 25,00 m · Campo ~80 × 120 m',
    icon: '⚽',
  },
];

/**
 * Calculates scale multiplier given target height and raw model bounding box height
 * Formula: escala = alvo / altura_atual_da_bbox
 * Example: 2.80 / 0.93 = 3.01
 */
export function calculatePresetScale(rawHeight: number, targetHeight: number): number {
  if (!rawHeight || rawHeight <= 0) return 1.0;
  const scale = targetHeight / rawHeight;
  return parseFloat(scale.toFixed(3));
}
