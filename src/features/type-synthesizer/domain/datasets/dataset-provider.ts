import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import * as https from 'node:https';
import { assertLoopbackHost } from '../../../../shared/kernel/index';
import * as identity from './identity.dataset';
import * as finance from './finance.dataset';
import * as commerce from './commerce.dataset';
import * as location from './location.dataset';
import * as analytics from './analytics.dataset';

export interface CustomDatasetPools {
  fullNames?: string[];
  firstNames?: string[];
  lastNames?: string[];
  emails?: string[];
  phones?: string[];
  companies?: string[];
  streets?: string[];
  cities?: string[];
  countries?: string[];
  productNames?: string[];
  accountNames?: string[];
  cardNames?: string[];
  serviceNames?: string[];
  categoryNames?: string[];
  merchants?: string[];
  descriptions?: string[];
  ibans?: string[];
  brands?: string[];
}

export interface HybridSeederState {
  enabled: boolean;
  status: 'offline' | 'synced' | 'fallback';
  recordCount: number;
  sourceLabel: string;
}

export class DatasetProvider {
  private customPools: CustomDatasetPools = {};
  private _hybridEnabled = false;
  private _status: 'offline' | 'synced' | 'fallback' = 'offline';
  private _recordCount = 0;

  public getState(): HybridSeederState {
    return {
      enabled: this._hybridEnabled,
      status: this._status,
      recordCount: this._recordCount,
      sourceLabel: !this._hybridEnabled
        ? 'Offline Built-In'
        : this._status === 'synced'
        ? `Hybrid API (${this._recordCount} records)`
        : 'Hybrid (Offline Fallback)',
    };
  }

  public pick<T>(customPool: readonly T[] | undefined, fallbackPool: readonly T[], itemIndex: number): T {
    const active = customPool && customPool.length > 0 ? customPool : fallbackPool;
    const safeIdx = Math.abs(itemIndex) % active.length;
    return active[safeIdx]!;
  }

  public loadWorkspaceDataset(workspaceRoot: string): boolean {
    try {
      const seedPath = path.join(workspaceRoot, '.mockscope', 'seed-data.json');
      if (!fs.existsSync(seedPath)) {
        return false;
      }
      const raw = fs.readFileSync(seedPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.applyCustomPools(parsed as CustomDatasetPools);
        return true;
      }
    } catch {
    }
    return false;
  }

  public async enableHybridPublicApiWithFallback(workspaceRoot?: string): Promise<HybridSeederState> {
    this._hybridEnabled = true;

    try {
      const [usersJson, productsJson] = await Promise.all([
        this.fetchHttpsJson('https://dummyjson.com/users?limit=24'),
        this.fetchHttpsJson('https://dummyjson.com/products?limit=24'),
      ]);

      const users = Array.isArray((usersJson as any)?.users) ? ((usersJson as any).users as any[]) : [];
      const products = Array.isArray((productsJson as any)?.products)
        ? ((productsJson as any).products as any[])
        : [];

      if (users.length === 0 && products.length === 0) {
        throw new Error('Empty public dataset response');
      }

      const str = (v: unknown): string | undefined =>
        typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, 140) : undefined;

      const fullNames = [
        identity.FULL_NAMES[0],
        ...users
          .map((u) => {
            const fn = str(u?.firstName);
            const ln = str(u?.lastName);
            return fn && ln ? `${fn} ${ln}` : undefined;
          })
          .filter((v): v is string => Boolean(v)),
      ];
      const firstNames = [
        identity.FIRST_NAMES[0],
        ...users.map((u) => str(u?.firstName)).filter((v): v is string => Boolean(v)),
      ];
      const lastNames = [
        identity.LAST_NAMES[0],
        ...users.map((u) => str(u?.lastName)).filter((v): v is string => Boolean(v)),
      ];
      const emails = [
        identity.EMAIL_ADDRESSES[0],
        ...users.map((u) => str(u?.email)).filter((v): v is string => Boolean(v)),
      ];
      const phones = [
        identity.PHONE_NUMBERS[0],
        ...users.map((u) => str(u?.phone)).filter((v): v is string => Boolean(v)),
      ];
      const companies = [
        identity.COMPANY_NAMES[0],
        ...users.map((u) => str(u?.company?.name)).filter((v): v is string => Boolean(v)),
      ];
      const streets = [
        location.STREETS[0],
        ...users.map((u) => str(u?.address?.address)).filter((v): v is string => Boolean(v)),
      ];
      const cities = [
        location.CITIES[0],
        ...users.map((u) => str(u?.address?.city)).filter((v): v is string => Boolean(v)),
      ];
      const countries = [
        location.COUNTRIES[0],
        ...users.map((u) => str(u?.address?.country)).filter((v): v is string => Boolean(v)),
      ];
      const ibans = [
        finance.IBAN_POOL[0],
        ...users
          .map((u) => str(u?.bank?.iban)?.replace(/\s+/g, ''))
          .filter((v): v is string => Boolean(v)),
      ];
      const productNames = [
        commerce.PRODUCT_NAMES[0],
        ...products.map((p) => str(p?.title)).filter((v): v is string => Boolean(v)),
      ];
      const brands = [
        commerce.BRAND_NAMES[0],
        ...products.map((p) => str(p?.brand)).filter((v): v is string => Boolean(v)),
      ];
      const descriptions = [
        finance.TRANSACTION_DESCRIPTIONS[0],
        ...products.map((p) => str(p?.description)).filter((v): v is string => Boolean(v)),
      ];

      const pools: CustomDatasetPools = {
        fullNames,
        firstNames,
        lastNames,
        emails,
        phones,
        companies,
        streets,
        cities,
        countries,
        ibans,
        productNames,
        brands,
        descriptions,
      };

      this.applyCustomPools(pools);
      this._status = 'synced';
      this._recordCount = users.length + products.length;

      if (workspaceRoot) {
        try {
          const dir = path.join(workspaceRoot, '.mockscope');
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(
            path.join(dir, 'public-seed-cache.json'),
            JSON.stringify({ timestamp: Date.now(), recordCount: this._recordCount, pools }, null, 2),
            'utf-8'
          );
        } catch {
        }
      }

      return this.getState();
    } catch {
      if (workspaceRoot) {
        try {
          const cachePath = path.join(workspaceRoot, '.mockscope', 'public-seed-cache.json');
          if (fs.existsSync(cachePath)) {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            if (cached?.pools && typeof cached.pools === 'object') {
              this.applyCustomPools(cached.pools as CustomDatasetPools);
              this._status = 'fallback';
              this._recordCount = Number(cached.recordCount) || 24;
              return this.getState();
            }
          }
        } catch {
        }
      }

      this.customPools = {};
      this._status = 'fallback';
      this._recordCount = 0;
      return this.getState();
    }
  }

  public disableHybridPublicApi(): HybridSeederState {
    this._hybridEnabled = false;
    this._status = 'offline';
    this._recordCount = 0;
    this.customPools = {};
    return this.getState();
  }

  private fetchHttpsJson(url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: 2500 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Status ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }

  public async fetchLoopbackDatasetWithFallback(port: number, endpointPath = '/seed-data.json'): Promise<boolean> {
    const host = '127.0.0.1';
    assertLoopbackHost(host);

    return new Promise<boolean>((resolve) => {
      const req = http.get(
        {
          hostname: host,
          port,
          path: endpointPath,
          timeout: 800,
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            resolve(false);
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
              if (parsed && typeof parsed === 'object') {
                this.applyCustomPools(parsed as CustomDatasetPools);
                resolve(true);
                return;
              }
            } catch {
            }
            resolve(false);
          });
        }
      );

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  public applyCustomPools(pools: CustomDatasetPools): void {
    this.customPools = { ...this.customPools, ...pools };
  }

  public resetCustomPools(): void {
    this.customPools = {};
  }

  public getFullName(index: number): string {
    return this.pick(this.customPools.fullNames, identity.FULL_NAMES, index);
  }

  public getFirstName(index: number): string {
    return this.pick(this.customPools.firstNames, identity.FIRST_NAMES, index);
  }

  public getLastName(index: number): string {
    return this.pick(this.customPools.lastNames, identity.LAST_NAMES, index);
  }

  public getEmail(index: number): string {
    return this.pick(this.customPools.emails, identity.EMAIL_ADDRESSES, index);
  }

  public getPhone(index: number): string {
    return this.pick(this.customPools.phones, identity.PHONE_NUMBERS, index);
  }

  public getCompany(index: number): string {
    return this.pick(this.customPools.companies, identity.COMPANY_NAMES, index);
  }

  public getStreet(index: number): string {
    return this.pick(this.customPools.streets, location.STREETS, index);
  }

  public getCity(index: number): string {
    return this.pick(this.customPools.cities, location.CITIES, index);
  }

  public getCountry(index: number): string {
    return this.pick(this.customPools.countries, location.COUNTRIES, index);
  }

  public getIban(index: number): string {
    return this.pick(this.customPools.ibans, finance.IBAN_POOL, index);
  }

  public getProductName(index: number): string {
    return this.pick(this.customPools.productNames, commerce.PRODUCT_NAMES, index);
  }

  public getBrandName(index: number): string {
    return this.pick(this.customPools.brands, commerce.BRAND_NAMES, index);
  }

  public getAccountName(index: number): string {
    return this.pick(this.customPools.accountNames, finance.ACCOUNT_NAMES, index);
  }

  public getCardName(index: number): string {
    return this.pick(this.customPools.cardNames, finance.CARD_NAMES, index);
  }

  public getServiceName(index: number): string {
    return this.pick(this.customPools.serviceNames, finance.SERVICE_NAMES, index);
  }

  public getCategoryName(index: number): string {
    return this.pick(this.customPools.categoryNames, finance.CATEGORY_NAMES, index);
  }

  public getMerchantName(index: number): string {
    return this.pick(this.customPools.merchants, finance.MERCHANT_NAMES, index);
  }

  public getTransactionDescription(index: number): string {
    return this.pick(this.customPools.descriptions, finance.TRANSACTION_DESCRIPTIONS, index);
  }

  public get isoTimestamps() {
    return analytics.ISO_TIMESTAMPS;
  }
}

export const datasetProvider = new DatasetProvider();
