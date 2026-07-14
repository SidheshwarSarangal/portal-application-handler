export type PortalStatus =
  | "submitted"
  | "submitted_unconfirmed"
  | "needs_input"
  | "review_required"
  | "already_applied"
  | "job_expired"
  | "unsupported_platform"
  | "failed";

export type ResourceKind =
  | "session"
  | "field_value"
  | "file"
  | "manual_action"
  | "review"
  | "confirmation";
export type Sensitivity = "ordinary" | "personal" | "sensitive" | "legal";
export type ResourceSource = "run" | "database" | "session_runtime" | "user";

export type BrowserStorageState = Readonly<{
  cookies: readonly Record<string, unknown>[];
  origins: readonly Readonly<{
    origin: string;
    localStorage: readonly Readonly<{ name: string; value: string }>[];
  }>[];
}>;

export type BrowserSessionArtifact = Readonly<{
  artifactVersion: 1;
  artifactId: string;
  kind: "browser_session";
  providerId: string;
  accountId?: string;
  status: "connected";
  createdAt: string;
  expiresAt?: string;
  storageState: BrowserStorageState;
}>;

export type HandlerLimits = Readonly<{
  maxSteps: number;
  maxRedirects: number;
  maxClicks: number;
  maxFieldsPerStep: number;
  maxFileBytes: number;
  timeoutMsPerStep: number;
  totalTimeoutMs: number;
  liveLeaseMs: number;
}>;

export type SubmissionPolicy = Readonly<{
  autoSubmit?: boolean;
  reviewBeforeSubmit?: boolean;
  trustedPlatforms?: readonly string[];
  minimumConfidence?: number;
  allowSensitiveStoredValues?: boolean;
  captureEvidence?: "never" | "review" | "failure";
}>;

export type ContinuationState = Readonly<{
  version: 1;
  runId: string;
  runHandle: string;
  provider?: string;
  currentUrl: string;
  stepIndex: number;
  clicks: number;
  redirects: number;
  formFingerprint?: string;
  pendingRequestId?: string;
  actionIds: readonly string[];
  leaseExpiresAt: string;
}>;

export type ResourceRequest = Readonly<{
  version: 1;
  requestId: string;
  runId: string;
  kind: ResourceKind;
  key: string;
  message: string;
  purpose: string;
  sensitivity: Sensitivity;
  allowedSources: readonly ResourceSource[];
  cacheHint: "run_only" | "profile_candidate" | "never";
  provider?: string;
  accountId?: string;
  fieldId?: string;
  inputType?: string;
  options?: readonly string[];
  required?: boolean;
}>;

export type ResourceResponse = Readonly<{
  version: 1;
  requestId: string;
  runId: string;
  status: "resolved" | "unavailable" | "denied" | "cancelled";
  source?: ResourceSource;
  value?: unknown;
  session?: BrowserSessionArtifact;
  retention?: "run_only" | "approved_profile_update" | "do_not_store";
}>;

export type PortalHandlerInput = Readonly<{
  runId?: string;
  applicationLink: string;
  sessions?: Readonly<Record<string, BrowserSessionArtifact>>;
  availableData?: Readonly<Record<string, unknown>>;
  files?: Readonly<{ resumePath?: string; coverLetterPath?: string }>;
  policy?: SubmissionPolicy;
  limits?: Partial<HandlerLimits>;
  signal?: AbortSignal;
}>;

export type ResumeInput = Readonly<{
  continuation: ContinuationState;
  response: ResourceResponse;
  signal?: AbortSignal;
}>;

export type FilledField = Readonly<{
  fieldId: string;
  key: string;
  label: string;
  confidence: number;
  source: "available_data" | "file" | "resource_response";
}>;

export type SafeError = Readonly<{ code: string; message: string; retryable: boolean }>;

export type PortalHandlerOutput = Readonly<{
  version: 1;
  runId: string;
  status: PortalStatus;
  provider?: string;
  finalUrl?: string;
  stepsCompleted: number;
  confidence?: number;
  filledFields: readonly FilledField[];
  neededInput?: ResourceRequest;
  continuation?: ContinuationState;
  evidence?: Readonly<{ confirmationText?: string; confirmationUrl?: string }>;
  error?: SafeError;
}>;

export type FieldSnapshot = Readonly<{
  id: string;
  locator: string;
  tag: "input" | "select" | "textarea";
  inputType: string;
  label: string;
  placeholder: string;
  name: string;
  required: boolean;
  disabled: boolean;
  value: string;
  checked: boolean;
  options: readonly string[];
}>;

export type ActionSnapshot = Readonly<{
  id: string;
  locator: string;
  text: string;
  kind: "button" | "link" | "submit";
  disabled: boolean;
}>;

export type PageSnapshot = Readonly<{
  url: string;
  title: string;
  text: string;
  fields: readonly FieldSnapshot[];
  actions: readonly ActionSnapshot[];
  hasCaptcha: boolean;
  hasOtp: boolean;
  fingerprint: string;
}>;

export interface PagePort {
  url(): string;
  goto(url: string, timeoutMs: number): Promise<void>;
  snapshot(maxFields: number): Promise<PageSnapshot>;
  click(locator: string, timeoutMs: number): Promise<void>;
  fill(locator: string, value: string, timeoutMs: number): Promise<void>;
  select(locator: string, value: string, timeoutMs: number): Promise<void>;
  check(locator: string, checked: boolean, timeoutMs: number): Promise<void>;
  upload(locator: string, path: string, timeoutMs: number): Promise<void>;
  waitForSettled(timeoutMs: number): Promise<void>;
}

export interface BrowserRuntime {
  readonly page: PagePort;
  close(): Promise<void>;
}

export interface BrowserDriver {
  launch(options: Readonly<{
    storageState?: BrowserStorageState;
    headless: boolean;
    timeoutMs: number;
    allowedDomains: readonly string[];
    allowLoopbackForTesting?: boolean;
  }>): Promise<BrowserRuntime>;
}

export type PlatformState =
  | "job_page"
  | "form"
  | "login_required"
  | "already_applied"
  | "job_expired"
  | "submitted"
  | "unknown";

export type NavigationDecision = Readonly<{
  state: PlatformState;
  actionLocator?: string;
  reason: string;
}>;

export interface PlatformAdapter {
  readonly provider: string;
  readonly version: string;
  readonly domains: readonly string[];
  canHandle(url: URL): boolean;
  inspect(snapshot: PageSnapshot): NavigationDecision;
}

export interface SafeLogger {
  debug(event: string, fields?: Readonly<Record<string, unknown>>): void;
  info(event: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields?: Readonly<Record<string, unknown>>): void;
  error(event: string, fields?: Readonly<Record<string, unknown>>): void;
}

export type HandlerOptions = Readonly<{
  browserDriver?: BrowserDriver;
  adapters?: readonly PlatformAdapter[];
  logger?: SafeLogger;
  now?: () => Date;
  headless?: boolean;
  allowLoopbackForTesting?: boolean;
  allowedFileRoots?: readonly string[];
}>;
