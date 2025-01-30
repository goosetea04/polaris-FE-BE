import type { Feature } from 'geojson'; //Implement Feature from geojson

export type View = "Draw" | "Map"
export type Coordinates = [number, number] | null;
export type DangerZone = {
  id: string;
  coordinates: number[][][];
}

export interface DrawCreateEvent {
  features: Feature[];
  type: string;
}

export type Database = {
  // Empty for now; Implement database later
}

export interface DrawDeleteEvent {
  features: Feature[];
  type: string;
}

export interface SafeRoutingOptions {
    bufferDistance: number; // Distance in kilometers to buffer around danger zones
    numPerimeterPoints: number; // Number of points to generate around danger zone perimeter
    maxAttempts: number; // Maximum attempts to find a safe path
  }
  