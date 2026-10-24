"use client";

import { usePage } from "../engine/next";
import { sessionMotion } from "../motion/session";

export function SessionMotion() {
  usePage(sessionMotion);
  return null;
}
