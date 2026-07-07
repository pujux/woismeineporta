import type { MetadataRoute } from "next";

const BASE_URL = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE_URL}/impressum`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${BASE_URL}/datenschutz`, changeFrequency: "yearly", priority: 0.1 },
  ];
}
