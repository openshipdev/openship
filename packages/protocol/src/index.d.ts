export type OpenShipEncoding = "utf-8" | "base64";
export type OpenShipCapability = "discovery" | "sources" | "changes" | "systems";
export interface SourceFileMetadata { path: string; size: number; sha256: string; encoding: OpenShipEncoding; mediaType: string; type: "file" | "symlink"; target?: string; [key: string]: unknown }
export interface SourcesManifest { openship: "1.0"; capability: "sources"; digest: string; project: { name: string; description: string; [key: string]: unknown }; totals: { files: number; bytes: number; [key: string]: unknown }; files: SourceFileMetadata[]; [key: string]: unknown }
export interface SourcesBundle { openship: "1.0"; capability: "sources"; digest: string; files: Record<string, { encoding: OpenShipEncoding; content: string; [key: string]: unknown }>; [key: string]: unknown }
export interface DiscoveryDocument { openship: "1.0"; capability: "discovery"; project: { name: string; description: string; [key: string]: unknown }; capabilities: { sources: { manifest: string; bundle: string; [key: string]: unknown }; systems?: { document: string; [key: string]: unknown }; changes?: { policy: string; submit: string; status: string; [key: string]: unknown }; [key: string]: unknown }; [key: string]: unknown }
export type SystemsNodeKind = "Root" | "Host" | "Container" | "Process" | "Library";
export type SystemsNodeOwnership = "first_party" | "third_party";
export interface SystemsNodeMetadata { ownership: SystemsNodeOwnership; [key: string]: unknown }
export interface SystemsNode { id: string; kind: SystemsNodeKind; name: string; parentId?: string; sourceSelectors?: string[]; metadata: SystemsNodeMetadata; [key: string]: unknown }
export interface SystemsGraph { id: string; name: string; rootNodeId: string; nodes: SystemsNode[]; edges: Array<Record<string, unknown>>; metadata?: Record<string, unknown>; context?: Record<string, unknown>; [key: string]: unknown }
export interface SystemsDocument { openship: "1.0"; capability: "systems"; source: { manifest: SourcesManifest; bundle: SourcesBundle; [key: string]: unknown }; system: SystemsGraph; [key: string]: unknown }
export interface VerifiedSourceFile { metadata: SourceFileMetadata; bytes: Uint8Array }
export interface VerifiedSources { manifest: SourcesManifest; bundle: SourcesBundle; files: VerifiedSourceFile[]; decodedBytes: number }
export interface FetchedOpenShip { origin: string; discovery: DiscoveryDocument; snapshot: { kind: "systems"; document: SystemsDocument } | { kind: "sources"; manifest: SourcesManifest; bundle: SourcesBundle }; verified: VerifiedSources }
export class OpenShipValidationError extends Error { path: string; code: string; constructor(path: string, message: string, code?: string) }
export function sha256Hex(value: string | Uint8Array): string;
export function decodeOpenShipBase64(value: string, path?: string): Uint8Array;
export function encodeOpenShipBase64(value: Uint8Array): string;
export function assertSafePath(value: unknown, path?: string): string;
export function compareUtf8(left: string, right: string): number;
export function matchOpenShipPattern(pattern: string, path: string): boolean;
export function computeSourcesDigest(files: SourceFileMetadata[]): string;
export function validateDiscovery(value: unknown): DiscoveryDocument;
export function validateSources(manifest: unknown, bundle: unknown, options?: { maxDecodedBytes?: number }): VerifiedSources;
export function validateSystems(value: unknown, options?: { maxDecodedBytes?: number }): SystemsDocument;
export function validateChangesDocument(value: unknown): Record<string, unknown>;
export function validateChangesSubmission(value: unknown): Record<string, unknown>;
export function validateChangesAccepted(value: unknown): Record<string, unknown>;
export function validateChangesStatus(value: unknown): Record<string, unknown>;
export function validateChangesPolicy(value: unknown): Record<string, unknown>;
export function validateChangesViolation(value: unknown): Record<string, unknown>;
export function normalizeOpenShipOrigin(origin: string, options?: { allowLoopbackHttp?: boolean }): string;
export function fetchOpenShip(origin: string, options?: { fetch?: typeof fetch; maxDecodedBytes?: number; allowLoopbackHttp?: boolean; preferSystems?: boolean }): Promise<FetchedOpenShip>;
export function composeChangesSubmission(base: VerifiedSources, current: VerifiedSources, input: { title: string; intent: string }): Record<string, unknown>;
export function diffSources(base: VerifiedSources, current: VerifiedSources): Array<{ path: string; operation: "create" | "replace" | "delete"; before: VerifiedSourceFile | null; after: VerifiedSourceFile | null }>;
