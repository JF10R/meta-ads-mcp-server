/**
 * Base Meta Ads Service
 * Core service class for Meta Marketing API interactions
 */

import * as adsSdk from 'facebook-nodejs-business-sdk';
import type { MetaAdsConfig } from '../types/config.types.js';
import type { MetaCursor } from '../types/meta-ads.types.js';
import { logger } from '../utils/logger.js';

export class MetaAdsService {
  private static shared: null | {
    api: typeof adsSdk.FacebookAdsApi;
    config: MetaAdsConfig;
    AdAccount: typeof adsSdk.AdAccount;
    Campaign: typeof adsSdk.Campaign;
    AdSet: typeof adsSdk.AdSet;
    Ad: typeof adsSdk.Ad;
    AdCreative: typeof adsSdk.AdCreative;
    AdsPixel: typeof adsSdk.AdsPixel;
    CustomAudience: typeof adsSdk.CustomAudience;
    isDebug: boolean;
  } = null;

  private static sameConfig(a: MetaAdsConfig, b: MetaAdsConfig): boolean {
    return (
      a.accessToken === b.accessToken &&
      a.apiVersion === b.apiVersion &&
      a.appId === b.appId &&
      a.appSecret === b.appSecret
    );
  }

  protected api: typeof adsSdk.FacebookAdsApi;
  protected config: MetaAdsConfig;
  protected readonly AdAccount: typeof adsSdk.AdAccount;
  protected readonly Campaign: typeof adsSdk.Campaign;
  protected readonly AdSet: typeof adsSdk.AdSet;
  protected readonly Ad: typeof adsSdk.Ad;
  protected readonly AdCreative: typeof adsSdk.AdCreative;
  protected readonly AdsPixel: typeof adsSdk.AdsPixel;
  protected readonly CustomAudience: typeof adsSdk.CustomAudience;

  constructor(config: MetaAdsConfig) {
    this.config = config;

    if (MetaAdsService.shared && MetaAdsService.sameConfig(MetaAdsService.shared.config, config)) {
      this.api = MetaAdsService.shared.api;
      this.AdAccount = MetaAdsService.shared.AdAccount;
      this.Campaign = MetaAdsService.shared.Campaign;
      this.AdSet = MetaAdsService.shared.AdSet;
      this.Ad = MetaAdsService.shared.Ad;
      this.AdCreative = MetaAdsService.shared.AdCreative;
      this.AdsPixel = MetaAdsService.shared.AdsPixel;
      this.CustomAudience = MetaAdsService.shared.CustomAudience;
      return;
    }

    if (MetaAdsService.shared && !MetaAdsService.sameConfig(MetaAdsService.shared.config, config)) {
      logger.warn('Meta Ads config changed; reinitializing shared SDK instance', {
        previousVersion: MetaAdsService.shared.config.apiVersion,
        requestedVersion: config.apiVersion,
      });
    }

    // Initialize Facebook Ads API
    this.api = adsSdk.FacebookAdsApi.init(config.accessToken);

    // Set API version if supported by SDK (older SDKs expose VERSION only)
    if (config.apiVersion) {
      const apiAny = this.api as unknown as { setVersion?: (version: string) => void };
      if (typeof apiAny.setVersion === 'function') {
        apiAny.setVersion(config.apiVersion);
      } else {
        const sdkVersion = (adsSdk.FacebookAdsApi as unknown as { VERSION?: string }).VERSION;
        if (sdkVersion && sdkVersion !== config.apiVersion) {
          logger.warn('Meta Ads SDK does not support runtime API version override', {
            requestedVersion: config.apiVersion,
            sdkVersion,
          });
        }
      }
    }

    // Enable debug mode if LOG_LEVEL is debug
    const isDebug = process.env.DEBUG === 'true' || logger.isDebugEnabled();
    if (isDebug) {
      this.api.setDebug(true);
      logger.debug('Meta Ads SDK debug mode enabled');
    }

    // Store SDK classes for easy access
    this.AdAccount = adsSdk.AdAccount;
    this.Campaign = adsSdk.Campaign;
    this.AdSet = adsSdk.AdSet;
    this.Ad = adsSdk.Ad;
    this.AdCreative = adsSdk.AdCreative;
    this.AdsPixel = adsSdk.AdsPixel;
    this.CustomAudience = adsSdk.CustomAudience;

    MetaAdsService.shared = {
      api: this.api,
      config,
      AdAccount: this.AdAccount,
      Campaign: this.Campaign,
      AdSet: this.AdSet,
      Ad: this.Ad,
      AdCreative: this.AdCreative,
      AdsPixel: this.AdsPixel,
      CustomAudience: this.CustomAudience,
      isDebug,
    };

    const sdkVersion = (adsSdk.FacebookAdsApi as unknown as { VERSION?: string }).VERSION;
    logger.info('Meta Ads Service initialized', {
      apiVersion: config.apiVersion || sdkVersion || 'default',
      debug: isDebug,
    });
  }

  /**
   * Paginate through all results from a Meta API cursor
   * @param cursor Meta API cursor object
   * @returns Array of all results
   */
  protected async paginateAll<T = any>(cursor: MetaCursor): Promise<T[]> {
    const results: T[] = [];

    try {
      // Add initial page
      for (const item of cursor) {
        results.push(item);
      }

      // Fetch subsequent pages
      while (cursor.hasNext()) {
        const nextCursor = await cursor.next();
        for (const item of nextCursor) {
          results.push(item);
        }
        // Update cursor for next iteration
        cursor = nextCursor;
      }

      logger.debug('Pagination complete', {
        totalResults: results.length,
      });

      return results;
    } catch (error) {
      logger.error('Pagination failed', {
        error: error instanceof Error ? error.message : String(error),
        resultsCollected: results.length,
      });
      throw error;
    }
  }

  /**
   * Paginate with a limit on total results
   * @param cursor Meta API cursor object
   * @param maxResults Maximum number of results to fetch
   * @returns Array of results up to maxResults
   */
  protected async paginateWithLimit<T = any>(
    cursor: MetaCursor,
    maxResults: number
  ): Promise<T[]> {
    const results: T[] = [];

    try {
      // Add initial page
      for (const item of cursor) {
        results.push(item);
        if (results.length >= maxResults) {
          return results.slice(0, maxResults);
        }
      }

      // Fetch subsequent pages until limit reached
      while (cursor.hasNext() && results.length < maxResults) {
        const nextCursor = await cursor.next();
        for (const item of nextCursor) {
          results.push(item);
          if (results.length >= maxResults) {
            return results.slice(0, maxResults);
          }
        }
        cursor = nextCursor;
      }

      logger.debug('Pagination with limit complete', {
        totalResults: results.length,
        maxResults,
      });

      return results;
    } catch (error) {
      logger.error('Pagination with limit failed', {
        error: error instanceof Error ? error.message : String(error),
        resultsCollected: results.length,
        maxResults,
      });
      throw error;
    }
  }

  /**
   * Normalize account ID (add 'act_' prefix if missing)
   */
  protected normalizeAccountId(accountId: string): string {
    return accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  }

  /**
   * Get API version being used
   */
  getApiVersion(): string {
    return this.config.apiVersion || this.api.getVersion();
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugMode(): boolean {
    return this.api.isDebug();
  }
}
