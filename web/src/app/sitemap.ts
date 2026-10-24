import type { MetadataRoute } from "next";
import { site } from "../data/session";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/console", "/log"].map((path) => ({ url: `${site.url}${path}` }));
}
