export type FrameworkType =
  | 'angular'
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'nuxt'
  | 'svelte'
  | 'three'
  | 'astro'
  | 'remix'
  | 'solid'
  | 'qwik'
  | 'ember'
  | 'gatsby'
  | 'vite'
  | 'webpack'
  | 'express'
  | 'nestjs'
  | 'vanilla';

export type NetworkClientType =
  | 'angular-http'
  | 'axios'
  | 'tanstack-query'
  | 'swr'
  | 'rtk-query'
  | 'ky'
  | 'superagent'
  | 'got'
  | 'ofetch'
  | 'wretch'
  | 'three-loader'
  | 'xhr'
  | 'fetch';

export interface FrameworkConvention {
  servicePatterns: string[];
  modelPatterns: string[];
  endpointPatterns: string[];
  description: string;
}

export interface ProjectStack {
  framework: FrameworkType;
  frameworkDisplayName: string;
  frameworkVersion?: string | undefined;
  networkClients: NetworkClientType[];
  primaryClient: NetworkClientType;
  hasTypeScript: boolean;
  conventions: FrameworkConvention;
  detectedConfigFiles: string[];
  authFeatures: {
    hasAuthEndpoints: boolean;
    has2faEndpoints: boolean;
    detectedKeywords: string[];
  };
}
