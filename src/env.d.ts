/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    adminUser?: {
      id: string;
      email?: string;
    };
    authResponseHeaders: Headers;
  }
}

