import type { components, paths } from './schema.gen';

type Schemas = components['schemas'];

/** Backend app info (`GET /api/v1/system/info`). */
export type AppInfo = Schemas['AppInfo'];

/** Error envelope returned by every failed request (docs/conventions/api.md §4). */
export type ApiErrorEnvelope = Schemas['ErrorEnvelope'];

/** Pagination meta shapes (api.md §6). */
export type OffsetPageMeta = Schemas['OffsetPageMeta'];
export type CursorPageMeta = Schemas['CursorPageMeta'];

/** Success envelope around a single resource (api.md §3). */
export interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

/** Auth + account (Phase 2). */
export type AuthSession = Schemas['AuthSession'];
export type AuthMe = Schemas['AuthMe'];
export type PublicUser = Schemas['PublicUser'];
export type PublicAccount = Schemas['PublicAccount'];
export type Session = Schemas['Session'];
export type WsTicket = Schemas['WsTicket'];
export type RbacCatalog = Schemas['RbacCatalog'];
export type TeamMember = Schemas['TeamMember'];
export type InviteInfo = Schemas['InviteInfo'];
export type ApiKey = Schemas['ApiKey'];
export type CreatedApiKey = Schemas['CreatedApiKey'];
export type AuditEntry = Schemas['AuditEntry'];
export type AdminAccountRow = Schemas['AdminAccountRow'];
export type AdminAccountDetail = Schemas['AdminAccountDetail'];

/** Contacts (Phase 3). */
export type Contact = Schemas['Contact'];
export type ContactList = Schemas['ContactList'];
export type ContactFilter = Schemas['ContactFilter'];
export type ContactFilterCondition = Schemas['ContactFilterCondition'];
export type CustomField = Schemas['CustomField'];
export type FieldType = Schemas['FieldType'];
export type Segment = Schemas['Segment'];
export type SegmentPreview = Schemas['SegmentPreview'];
export type DndEntry = Schemas['DndEntry'];
export type ImportColumnMapping = Schemas['ImportColumnMapping'];
export type ImportOptions = Schemas['ImportOptions'];
/** The generator renders the nullable `options` ref as `ImportOptions & (… | null)`; it is `null` until set. */
export type ImportJob = Omit<Schemas['ImportJob'], 'options'> & { options: ImportOptions | null };
export type ExportJob = Schemas['ExportJob'];

/** Success envelope with list meta. */
export interface ListEnvelope<T, M> {
  success: true;
  data: T[];
  meta: M;
}

/** Wallet, billing & payments (Phase 4). */
export type Wallet = Schemas['Wallet'];
export type WalletStatus = Wallet['status'];
export type RateCardView = Schemas['RateCardView'];
export type WalletEstimate = Schemas['WalletEstimate'];
export type LedgerEntry = Schemas['LedgerEntry'];
export type UsageSeries = Schemas['UsageSeries'];
export type BillingProfile = Schemas['BillingProfile'];
/** The generator renders the nullable `profile` ref as `BillingProfile & (… | null)`; it is `null` until saved. */
export type BillingProfileResponse = Omit<Schemas['BillingProfileResponse'], 'profile'> & {
  profile: BillingProfile | null;
};
export type GstState = Schemas['GstState'];
export type Invoice = Schemas['Invoice'];
export type TopupOrder = Schemas['TopupOrder'];
export type TopupCheckout = Schemas['TopupCheckout'];
export type Notification = Schemas['Notification'];
export type RateCardVersion = Schemas['RateCardVersion'];
export type AccountRateCards = Schemas['AccountRateCards'];
export type WalletAdjustment = Schemas['WalletAdjustment'];
export type SimulatedHold = Schemas['SimulatedHold'];
export type SimulatedCallResult = Schemas['SimulatedCallResult'];
export type BillingSummary = Schemas['BillingSummary'];
export type AdminPayment = Schemas['AdminPayment'];
export type PaymentEvent = Schemas['PaymentEvent'];
export type AdminBillingConfig = Schemas['AdminBillingConfig'];

/** AI agents, knowledge & playground (Phase 5). */
export type Agent = Schemas['Agent'];
export type AgentRow = Schemas['AgentRow'];
export type AgentFunction = Schemas['AgentFunction'];
export type AgentFunctionParam = AgentFunction['parameters'][number];
export type AgentFunctionHeader = AgentFunction['headers'][number];
export type AgentFunctionTestResult = Schemas['AgentFunctionTestResult'];
export type AgentTemplate = Schemas['AgentTemplate'];
export type AgentCatalog = Schemas['AgentCatalog'];
export type AgentVariable = AgentCatalog['variables'][number];
export type AgentUsage = Schemas['AgentUsage'];
export type CompilePreview = Schemas['AgentCompilePreview'];
export type AgentVoice = Agent['voice'];
export type AgentLanguage = Agent['language'];
export type ToneRule = Agent['toneRules'][number];
export type BuiltInTools = Agent['builtInTools'];
export type Disposition = AgentCatalog['dispositions'][number];
export type KnowledgeBase = Schemas['KnowledgeBase'];
export type KnowledgeSource = Schemas['KnowledgeSource'];
export type KnowledgeSearchResult = Schemas['KnowledgeHit'];
export type PlaygroundSession = Schemas['PlaygroundSession'];
export type PlaygroundSessionRow = Schemas['PlaygroundSessionRow'];
export type PlaygroundTurn = Schemas['PlaygroundTurn'];
export type PlaygroundToolCall = PlaygroundTurn['toolCalls'][number];
export type PlaygroundOutcome = PlaygroundSession['outcome'];
export type PlaygroundReply = Schemas['PlaygroundReply'];
export type AdminAiConfig = Schemas['AdminAiConfig'];

/** Call flows, simulator & flow audio (Phase 6). */
export type FlowListItem = Schemas['FlowListItem'];
export type Flow = Schemas['Flow'];
export type FlowIssue = Schemas['FlowIssue'];
export type FlowDraftSaved = Schemas['FlowDraftSaved'];
export type FlowVersionSummary = Schemas['FlowVersionSummary'];
export type FlowVersion = Schemas['FlowVersion'];
export type FlowTemplate = Schemas['FlowTemplate'];
export type FlowVariableInfo = Schemas['FlowVariableInfo'];
export type FlowCatalog = Schemas['FlowCatalog'];
export type FlowNodeCatalogEntry = FlowCatalog['nodes'][number];
export type FlowExitInfo = FlowNodeCatalogEntry['staticExits'][number];
export type FlowImportResult = Schemas['FlowImportResult'];
export type FlowEdge = Schemas['FlowEdge'];
export type FlowVariable = Schemas['FlowVariable'];
export type FlowSettings = Schemas['FlowSettings'];
export type FlowNodeType = Schemas['FlowNode']['type'];
/** Typed node configs (what a complete node looks like). */
export type FlowNodeConfigs = { [N in Schemas['FlowNode'] as N['type']]: N['config'] };
/**
 * A node as drafts hold it — configs may be incomplete while editing (the
 * server reports them as issues), so the builder works with plain objects.
 */
export interface DraftNode {
  id: string;
  type: FlowNodeType;
  label?: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}
export interface DraftGraph {
  schemaVersion: 1;
  nodes: DraftNode[];
  edges: FlowEdge[];
  variables: FlowVariable[];
  settings: FlowSettings;
  viewport?: { x: number; y: number; zoom: number };
}
export type FlowRun = Schemas['FlowRun'];
export type FlowRunSummary = Schemas['FlowRunSummary'];
export type FlowRunWaiting = NonNullable<FlowRun['waiting']>;
export type FlowSimulationStep = Schemas['FlowSimulationStep'];
export type FlowTranscriptEntry = Schemas['FlowTranscriptEntry'];
export type FlowTraceRow = NonNullable<FlowRun['trace']>[number];
export type FlowNodeStat = Schemas['FlowNodeStat'];
export type FlowAudio = Schemas['FlowAudio'];
export type FlowAudioUrl = Schemas['FlowAudioUrl'];
export type Call = Schemas['Call'];
export type CallStatusValue = Call['status'];
export type CallEndReason = NonNullable<Call['endReason']>;
export type StartedWebCall = Schemas['StartedWebCall'];
export type CallTranscriptTurn = Schemas['CallTranscriptTurn'];
export type CallEvent = Schemas['CallEvent'];
export type CallRecordingLink = Schemas['CallRecordingLink'];

/** Campaigns & single calls (Phase 8). */
export type Campaign = Schemas['Campaign'];
export type CampaignListItem = Schemas['CampaignListItem'];
export type CampaignSummary = Schemas['CampaignSummary'];
export type CampaignStatus = Campaign['status'];
export type CampaignPauseReason = NonNullable<Campaign['pauseReason']>;
export type CampaignStats = Campaign['stats'];
export type CampaignWindow = Campaign['window'];
export type CampaignSchedule = Campaign['schedule'];
export type CampaignRecurrence = NonNullable<CampaignSchedule['recurrence']>;
export type CampaignRetry = Campaign['retry'];
export type CampaignPacing = Campaign['pacing'];
export type CampaignFollowUps = Campaign['followUps'];
export type CampaignDryRun = NonNullable<Campaign['dryRun']>;
export type CampaignAudience = Campaign['audience'];
export type CampaignContactRow = Schemas['CampaignContactRow'];
export type CampaignContactStatus = CampaignContactRow['status'];
export type AudiencePreview = Schemas['AudiencePreview'];
export type CampaignEstimate = Schemas['CampaignEstimate'];
export type AccountLimits = Schemas['AccountLimits'];
export type AccountWithWarning = Schemas['AccountWithWarning'];

/** WhatsApp (Phase 9). */
export type WhatsAppChannel = Schemas['WhatsAppChannel'];
export type WhatsAppChannelDetail = Schemas['WhatsAppChannelDetail'];
export type WhatsAppChannelList = Schemas['WhatsAppChannelList'];
export type WhatsAppConnectResult = Schemas['WhatsAppConnectResult'];
export type WhatsAppConfig = Schemas['WhatsAppConfig'];
export type WhatsAppChannelStatus = WhatsAppChannel['status'];
export type WhatsAppMode = WhatsAppChannel['mode'];
export type WhatsAppQuality = WhatsAppChannel['qualityRating'];
export type WhatsAppLimitTier = NonNullable<WhatsAppChannel['messagingLimitTier']>;
export type WhatsAppSyncStatus = NonNullable<WhatsAppChannel['coexistence']>['contactsSync'];
export type WhatsAppMetaPayer = WhatsAppChannel['billing']['metaPayer'];
export type WhatsAppConnectStep = NonNullable<NonNullable<WhatsAppChannel['statusReason']>['step']>;
export type WhatsAppAdminStatus = Schemas['WhatsAppAdminStatus'];
export type MetaWebhookEventRow = Schemas['MetaWebhookEventRow'];
export type MetaWebhookReceipt = Schemas['MetaWebhookReceipt'];
export type AdminWhatsAppChannelRow = AdminAccountDetail['whatsappChannels'][number];

/** WhatsApp Inbox (Phase 10). */
export type InboxConversation = Schemas['InboxConversation'];
export type InboxConversationDetail = Schemas['InboxConversationDetail'];
export type InboxConversationStatus = InboxConversation['status'];
export type InboxLastMessage = NonNullable<InboxConversation['lastMessage']>;
export type InboxMessage = Schemas['InboxMessage'];
export type InboxMessageType = InboxMessage['type'];
export type InboxMessageStatus = InboxMessage['status'];
export type InboxMessageOrigin = InboxMessage['origin'];
export type InboxMedia = NonNullable<InboxMessage['media']>;
export type InboxInteractive = NonNullable<InboxMessage['interactive']>;
export type InboxSendMessage = Schemas['InboxSendMessage'];
export type InboxSendType = InboxSendMessage['type'];
export type InboxUpload = Schemas['InboxUpload'];
export type InboxUploadKind = InboxUpload['kind'];
export type InboxSettings = Schemas['InboxSettings'];
export type InboxNotifyMode = InboxSettings['notifyOnNewMessage'];
export type InboxConfig = Schemas['InboxConfig'];
export type InboxSummary = Schemas['InboxSummary'];
export type InboxContactPanel = Schemas['InboxContactPanel'];
export type WhatsAppBusinessProfile = Schemas['WhatsAppBusinessProfile'];

/** WhatsApp templates + message charges (Phase 11). */
export type WhatsAppTemplateListItem = Schemas['WhatsAppTemplateListItem'];
export type WhatsAppTemplate = Schemas['WhatsAppTemplate'];
export type WhatsAppTemplateCreate = Schemas['WhatsAppTemplateCreate'];
export type WhatsAppTemplateEdit = Schemas['WhatsAppTemplateEdit'];
export type WhatsAppTemplateSyncResult = Schemas['WhatsAppTemplateSyncResult'];
export type WhatsAppTemplateStatus = WhatsAppTemplateListItem['status'];
export type WhatsAppTemplateCategory = WhatsAppTemplateListItem['category'];
export type WhatsAppTemplateQuality = NonNullable<WhatsAppTemplateListItem['quality']>;
export type WhatsAppTemplatePurpose = WhatsAppTemplateListItem['purpose'];
export type WhatsAppParameterFormat = WhatsAppTemplateListItem['parameterFormat'];
export type WhatsAppTemplateComponent = WhatsAppTemplate['components'][number];
export type WhatsAppTemplateVariable = WhatsAppTemplate['variables'][number];
export type WhatsAppVariableSourceKind = WhatsAppTemplateVariable['defaultSource']['kind'];
export type WhatsAppVariableSourceInput =
  Schemas['WhatsAppTemplateVariableSources']['sources'][number];
export type WhatsAppPricePreview = Schemas['WhatsAppPricePreview'];
export type WhatsAppPricePreviewBody = Schemas['WhatsAppPricePreviewBody'];
export type WhatsAppPriceNote = WhatsAppPricePreview['note'];
export type WhatsAppRateCardSave = Schemas['WhatsAppRateCardSave'];
export type WhatsAppRateCardMarket = NonNullable<WhatsAppRateCardSave['markets']>[number];
/** Phase 12: one market of a calling card (per-minute rate). */
export type WhatsAppCallingRateMarket = NonNullable<WhatsAppRateCardSave['callingMarkets']>[number];
export type WhatsAppBillingSettingsPatch = Schemas['WhatsAppBillingSettingsPatch'];
export type WhatsAppBillingInput = Schemas['WhatsAppBillingInput'];
export type InboxMessageTemplate = NonNullable<InboxMessage['template']>;
export type InboxMessageBilling = NonNullable<InboxMessage['billing']>;
export type InboxTemplateSend = Extract<InboxSendMessage, { type: 'template' }>;
export type WalletWhatsAppPrices = RateCardView['whatsapp'];

type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  responses: { 200: { content: { 'application/json': { data: infer D } } } };
}
  ? D
  : never;

/** Superadmin WhatsApp billing (inline response shapes of the spec). */
export type WhatsAppRateCards = Ok<'/api/v1/admin/whatsapp-rates', 'get'>;
export type WhatsAppRateCard = NonNullable<WhatsAppRateCards['current']>;
export type WhatsAppRateImport = Ok<'/api/v1/admin/whatsapp-rates/import', 'post'>;
export type WhatsAppRateDiff = NonNullable<WhatsAppRateImport['diff']>;
export type WhatsAppBillingSettingsView = Ok<'/api/v1/admin/whatsapp-billing', 'get'>;
export type WhatsAppMarginRow = Ok<'/api/v1/admin/reports/whatsapp-margin', 'get'>[number];
export type WhatsAppReconcileRow = Ok<
  '/api/v1/admin/reports/whatsapp-reconciliation',
  'get'
>[number];
export type AccountWhatsAppBillingView = Ok<
  '/api/v1/admin/accounts/{id}/whatsapp-billing',
  'patch'
>;

type Created<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  responses: { 201: { content: { 'application/json': { data: infer D } } } };
}
  ? D
  : never;

/** WhatsApp calling (Phase 12). */
export type WhatsAppCallingSettings = Schemas['WhatsAppCallingSettings'];
export type WhatsAppCallingSettingsPatch = Schemas['WhatsAppCallingSettingsPatch'];
export type WhatsAppCallHours = WhatsAppCallingSettings['callHours'];
export type WhatsAppCallHoursEntry = WhatsAppCallHours['weekly'][number];
export type WhatsAppCallHoliday = WhatsAppCallHours['holidays'][number];
export type WhatsAppInboundRoute = WhatsAppCallingSettings['inbound']['route'];
export type WhatsAppCallProgram = NonNullable<WhatsAppCallingSettings['inbound']['aiProgram']>;
export type WhatsAppCallPermission = Schemas['WhatsAppCallPermission'];
export type WhatsAppCallPermissionStatus = WhatsAppCallPermission['status'];
export type WhatsAppCallMediaTicket = Schemas['WhatsAppCallMediaTicket'];
export type StartedWhatsAppCall = Created<'/api/v1/whatsapp/calls', 'post'>;
export type CallPermissionRequestResult = Created<
  '/api/v1/whatsapp/call-permissions/request',
  'post'
>;
export type CallAvailabilityStatus = Schemas['CallAvailability']['status'];
export type WhatsAppChannelCalling = WhatsAppChannel['calling'];

/** Phase 14 — post-call insights, outcomes, chat summaries, reports. */
export type CallInsights = Schemas['CallInsights'];
export type CallInsightVersion = Schemas['CallInsightVersion'];
export type InsightsSettings = Schemas['InsightsSettings'];
export type Dispositions = Schemas['Dispositions'];
export type AccountDisposition = Dispositions['dispositions'][number];
export type ChatSummary = Schemas['ChatSummary'];
export type Report = Schemas['Report'];
/** Phase 14 record exports (calls, message metadata, a report tab). */
export type RecordExport = Schemas['RecordExport'];
/** Phase 14 report e-mails (each person's own). */
export type ReportSubscription = Schemas['ReportSubscription'];
/** Phase 14 per-account retention (settings, effective days, platform, cap, bounds). */
export type Retention = Schemas['Retention'];
