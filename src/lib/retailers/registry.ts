import { amazonAdapter } from "./amazon";
import { bauhausAdapter } from "./bauhaus";
import { mediamarktAdapter } from "./mediamarkt";
import { obiAdapter } from "./obi";
import { teptoAdapter } from "./tepto";
import type { RetailerAdapter } from "./types";

export const adapters: RetailerAdapter[] = [obiAdapter, mediamarktAdapter, teptoAdapter, bauhausAdapter, amazonAdapter];
