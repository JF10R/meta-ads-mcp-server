#!/usr/bin/env node

/**
 * Meta Ads MCP Server
 * Main entry point for the Model Context Protocol server
 */

// Load environment variables from .env file FIRST (before any other imports)
import 'dotenv/config';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadAuthConfig } from './config/auth.config.js';
import { createMetaConfig } from './config/meta.config.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Import all tool schemas and classes
import { CampaignTools, listCampaignsSchema, getCampaignSchema, createCampaignSchema, updateCampaignSchema, deleteCampaignSchema } from './tools/campaign.tools.js';
import { AdSetTools, listAdSetsSchema, getAdSetSchema, createAdSetSchema, updateAdSetSchema, deleteAdSetSchema, duplicateAdSetSchema } from './tools/adset.tools.js';
import { AdTools, listAdsSchema, getAdSchema, createAdSchema, updateAdSchema, deleteAdSchema } from './tools/ad.tools.js';
import { AccountTools, listAdAccountsSchema, getAdAccountSchema, listPagesSchema, listInstagramAccountsSchema } from './tools/account.tools.js';
import { AudienceTools, listAudiencesSchema, getAudienceSchema, createCustomAudienceSchema, createLookalikeAudienceSchema, createSavedAudienceSchema, addUsersToAudienceSchema, removeUsersFromAudienceSchema } from './tools/audience.tools.js';
import { PixelTools, listPixelsSchema, getPixelSchema, createPixelSchema, listCustomConversionsSchema, createCustomConversionSchema } from './tools/pixel.tools.js';
import { BudgetTools, updateCampaignBudgetSchema, updateAdSetBudgetSchema } from './tools/budget.tools.js';
import { BatchTools, batchUpdateStatusSchema, batchUpdateBudgetsSchema } from './tools/batch.tools.js';
import { createCreativeTools } from './tools/creative.tools.js';
import { createInsightsTools } from './tools/insights.tools.js';

import { logger } from './utils/logger.js';
import { handleMetaApiError } from './utils/error-handler.js';

async function main() {
  try {
    // Load authentication configuration
    logger.info('Loading authentication configuration...');
    const authConfig = loadAuthConfig();

    // Track if token is available
    let metaConfig = null;
    let campaignTools = null;
    let adSetTools = null;
    let adTools = null;
    let accountTools = null;
    let audienceTools = null;
    let pixelTools = null;
    let budgetTools = null;
    let batchTools = null;
    let creativeTools: any[] = [];
    let insightsTools: any[] = [];
    const hasToken = authConfig !== null;

    if (hasToken) {
      logger.info('Meta access token detected', {
        length: authConfig.META_ACCESS_TOKEN.length,
      });

      // Create Meta API configuration
      metaConfig = createMetaConfig(authConfig.META_ACCESS_TOKEN, {
        apiVersion: authConfig.META_API_VERSION,
      });

      logger.info('Meta Ads API configured', {
        apiVersion: metaConfig.apiVersion || 'default',
      });

      // Initialize all tool instances
      campaignTools = new CampaignTools(metaConfig);
      adSetTools = new AdSetTools(metaConfig);
      adTools = new AdTools(metaConfig);
      accountTools = new AccountTools(metaConfig);
      audienceTools = new AudienceTools(metaConfig);
      pixelTools = new PixelTools(metaConfig);
      budgetTools = new BudgetTools(metaConfig);
      batchTools = new BatchTools(metaConfig);
      creativeTools = createCreativeTools(metaConfig);
      insightsTools = createInsightsTools(metaConfig);
    } else {
      logger.warn('No META_ACCESS_TOKEN found - server will start but tools will require configuration');
    }

    // Initialize MCP Server
    const server = new Server(
      {
        name: 'meta-ads-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register tool list handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [
        // Campaign tools
        listCampaignsSchema,
        getCampaignSchema,
        createCampaignSchema,
        updateCampaignSchema,
        deleteCampaignSchema,

        // Ad Set tools
        listAdSetsSchema,
        getAdSetSchema,
        createAdSetSchema,
        updateAdSetSchema,
        deleteAdSetSchema,
        duplicateAdSetSchema,

        // Ad tools
        listAdsSchema,
        getAdSchema,
        createAdSchema,
        updateAdSchema,
        deleteAdSchema,

        // Account tools
        listAdAccountsSchema,
        getAdAccountSchema,
        listPagesSchema,
        listInstagramAccountsSchema,

        // Audience tools
        listAudiencesSchema,
        getAudienceSchema,
        createCustomAudienceSchema,
        createLookalikeAudienceSchema,
        createSavedAudienceSchema,
        addUsersToAudienceSchema,
        removeUsersFromAudienceSchema,

        // Pixel tools
        listPixelsSchema,
        getPixelSchema,
        createPixelSchema,
        listCustomConversionsSchema,
        createCustomConversionSchema,

        // Budget tools
        updateCampaignBudgetSchema,
        updateAdSetBudgetSchema,

        // Batch tools
        batchUpdateStatusSchema,
        batchUpdateBudgetsSchema,

        // Creative tools (convert Zod schemas to JSON Schema)
        ...creativeTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: zodToJsonSchema(tool.inputSchema, { $refStrategy: 'none' }),
        })),

        // Insights tools (convert Zod schemas to JSON Schema)
        ...insightsTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: zodToJsonSchema(tool.inputSchema, { $refStrategy: 'none' }),
        })),
      ];

      return { tools };
    });

    // Register tool call handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        logger.debug('Tool called', { name, args });

        // Check if token is configured
        if (!hasToken) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    error: 'Meta Ads MCP Server is not configured with an access token',
                    help: {
                      message: 'To use Meta Ads tools, you need to configure a Meta access token.',
                      steps: [
                        '1. Get a token from Meta Graph API Explorer: https://developers.facebook.com/tools/explorer/',
                        '2. Select your app or create a new one',
                        '3. Request these permissions: ads_management, ads_read, business_management',
                        '4. Generate a User Access Token',
                        '5. Add to Claude Desktop config:',
                        '   "env": { "META_ACCESS_TOKEN": "your_token_here" }',
                        '6. Restart Claude Desktop'
                      ],
                      documentation: 'See docs/SETUP.md for detailed instructions'
                    }
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Campaign tools
        if (name === 'list_campaigns' && campaignTools) return await campaignTools.listCampaigns(args);
        if (name === 'get_campaign' && campaignTools) return await campaignTools.getCampaign(args);
        if (name === 'create_campaign' && campaignTools) return await campaignTools.createCampaign(args);
        if (name === 'update_campaign' && campaignTools) return await campaignTools.updateCampaign(args);
        if (name === 'delete_campaign' && campaignTools) return await campaignTools.deleteCampaign(args);

        // Ad Set tools
        if (name === 'list_adsets' && adSetTools) return await adSetTools.listAdSets(args);
        if (name === 'get_adset' && adSetTools) return await adSetTools.getAdSet(args);
        if (name === 'create_adset' && adSetTools) return await adSetTools.createAdSet(args);
        if (name === 'update_adset' && adSetTools) return await adSetTools.updateAdSet(args);
        if (name === 'delete_adset' && adSetTools) return await adSetTools.deleteAdSet(args);
        if (name === 'duplicate_adset' && adSetTools) return await adSetTools.duplicateAdSet(args);

        // Ad tools
        if (name === 'list_ads' && adTools) return await adTools.listAds(args);
        if (name === 'get_ad' && adTools) return await adTools.getAd(args);
        if (name === 'create_ad' && adTools) return await adTools.createAd(args);
        if (name === 'update_ad' && adTools) return await adTools.updateAd(args);
        if (name === 'delete_ad' && adTools) return await adTools.deleteAd(args);

        // Account tools
        if (name === 'list_ad_accounts' && accountTools) return await accountTools.listAdAccounts(args);
        if (name === 'get_ad_account' && accountTools) return await accountTools.getAdAccount(args);
        if (name === 'list_pages' && accountTools) return await accountTools.listPages(args);
        if (name === 'list_instagram_accounts' && accountTools) return await accountTools.listInstagramAccounts(args);

        // Audience tools
        if (name === 'list_audiences' && audienceTools) return await audienceTools.listAudiences(args);
        if (name === 'get_audience' && audienceTools) return await audienceTools.getAudience(args);
        if (name === 'create_custom_audience' && audienceTools) return await audienceTools.createCustomAudience(args);
        if (name === 'create_lookalike_audience' && audienceTools) return await audienceTools.createLookalikeAudience(args);
        if (name === 'create_saved_audience' && audienceTools) return await audienceTools.createSavedAudience(args);
        if (name === 'add_users_to_audience' && audienceTools) return await audienceTools.addUsersToAudience(args);
        if (name === 'remove_users_from_audience' && audienceTools) return await audienceTools.removeUsersFromAudience(args);

        // Pixel tools
        if (name === 'list_pixels' && pixelTools) return await pixelTools.listPixels(args);
        if (name === 'get_pixel' && pixelTools) return await pixelTools.getPixel(args);
        if (name === 'create_pixel' && pixelTools) return await pixelTools.createPixel(args);
        if (name === 'list_custom_conversions' && pixelTools) return await pixelTools.listCustomConversions(args);
        if (name === 'create_custom_conversion' && pixelTools) return await pixelTools.createCustomConversion(args);

        // Budget tools
        if (name === 'update_campaign_budget' && budgetTools) return await budgetTools.updateCampaignBudget(args);
        if (name === 'update_adset_budget' && budgetTools) return await budgetTools.updateAdSetBudget(args);

        // Batch tools
        if (name === 'batch_update_status' && batchTools) return await batchTools.batchUpdateStatus(args);
        if (name === 'batch_update_budgets' && batchTools) return await batchTools.batchUpdateBudgets(args);

        // Creative tools (function-based)
        const creativeTool = creativeTools.find(t => t.name === name);
        if (creativeTool) return await creativeTool.handler(args);

        // Insights tools (function-based)
        const insightsTool = insightsTools.find(t => t.name === name);
        if (insightsTool) return await insightsTool.handler(args);

        throw new Error(`Unknown tool: ${name}`);
      } catch (error) {
        logger.error('Tool execution failed', {
          tool: request.params.name,
          error: error instanceof Error ? error.message : String(error),
        });

        // Handle Meta API errors
        const metaError = handleMetaApiError(error);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: metaError.message,
                  code: metaError.code,
                  type: metaError.type,
                  ...(metaError.fbtraceId && { fbtraceId: metaError.fbtraceId }),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    });

    // Set up graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await server.close();
      process.exit(0);
    });

    // Start server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('Meta Ads MCP Server started successfully');
    logger.info(`Registered ${creativeTools.length + insightsTools.length + 33} tools`);
  } catch (error) {
    logger.error('Failed to start Meta Ads MCP Server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
