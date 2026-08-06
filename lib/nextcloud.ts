/**
 * Minimal Nextcloud client over WebDAV + OCS Share API.
 * Works with any Nextcloud (or compatible) instance reachable from the server.
 *
 * Configuration via env vars:
 *   NEXTCLOUD_URL          — e.g. https://cloud.example.com
 *   NEXTCLOUD_USERNAME     — login name
 *   NEXTCLOUD_PASSWORD     — app-password or account password
 *   NEXTCLOUD_BASE_FOLDER  — optional, defaults to "VitalCore/Radiology"
 *   NEXTCLOUD_PUBLIC_SHARE — optional, default "true" (creates a public link on upload)
 */

export interface NextcloudConfig {
    baseUrl: string;
    username: string;
    password: string;
    baseFolder: string;
    publicShare: boolean;
}

export interface UploadResult {
    /** Full WebDAV path of the file (e.g. /remote.php/dav/files/user/VitalCore/Radiology/abc.jpg) */
    webdavPath: string;
    /** Clean relative path within the user's files (e.g. /VitalCore/Radiology/abc.jpg) */
    remotePath: string;
    /** Public share URL (null if no share was created) */
    publicUrl: string | null;
    /** Share token (used to construct direct download URL) */
    shareToken: string | null;
    /** File size in bytes */
    size: number;
    /** Mime type */
    mimeType: string;
}

export function getNextcloudConfig(): NextcloudConfig {
    const baseUrl = (process.env.NEXTCLOUD_URL || '').replace(/\/+$/, '');
    return {
        baseUrl,
        username: process.env.NEXTCLOUD_USERNAME || '',
        password: process.env.NEXTCLOUD_PASSWORD || '',
        baseFolder: process.env.NEXTCLOUD_BASE_FOLDER || 'VitalCore/Radiology',
        publicShare: (process.env.NEXTCLOUD_PUBLIC_SHARE || 'true').toLowerCase() !== 'false',
    };
}

export function isNextcloudConfigured(cfg: NextcloudConfig = getNextcloudConfig()): boolean {
    return Boolean(cfg.baseUrl && cfg.username && cfg.password);
}

function basicAuth(cfg: NextcloudConfig): string {
    return 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
}

/** Make sure the target folder exists (mkdir -p). */
async function ensureFolder(cfg: NextcloudConfig, remotePath: string): Promise<void> {
    const parts = remotePath.split('/').filter(Boolean);
    let acc = '';
    for (const part of parts) {
        acc += '/' + part;
        const url = `${cfg.baseUrl}/remote.php/dav/files/${encodeURIComponent(cfg.username)}${acc}`;
        // MKCOL returns 201 (created) or 405 (already exists) — both are fine
        const res = await fetch(url, { method: 'MKCOL', headers: { Authorization: basicAuth(cfg) } });
        if (!res.ok && res.status !== 405 && res.status !== 301) {
            // ignore, will surface on PUT if something is truly wrong
        }
    }
}

/**
 * Upload a file to Nextcloud at the given relative path.
 * @param folder     — e.g. "VitalCore/Radiology" (or override per-call)
 * @param fileName   — the filename to use at the destination
 * @param data       — file contents (Buffer or Uint8Array)
 * @param mimeType   — e.g. "image/jpeg"
 * @param subFolder  — optional subfolder (e.g. patientNumber/visitId)
 */
export async function uploadFile(
    data: Buffer | Uint8Array,
    fileName: string,
    mimeType: string,
    subFolder?: string,
): Promise<UploadResult> {
    const cfg = getNextcloudConfig();
    if (!isNextcloudConfigured(cfg)) {
        throw new Error('Nextcloud is not configured. Set NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_PASSWORD in .env');
    }

    const folderParts = [cfg.baseFolder];
    if (subFolder) folderParts.push(subFolder);
    const remoteDir = '/' + folderParts.join('/');
    const remotePath = `${remoteDir}/${fileName}`;
    const webdavUrl = `${cfg.baseUrl}/remote.php/dav/files/${encodeURIComponent(cfg.username)}${remotePath}`;

    // 1. Ensure folder chain exists
    await ensureFolder(cfg, remoteDir);

    // 2. PUT the file
    const putRes = await fetch(webdavUrl, {
        method: 'PUT',
        headers: {
            Authorization: basicAuth(cfg),
            'Content-Type': mimeType,
            'OC-Chunked': '0',
        },
        body: data as any,
    });
    if (!putRes.ok) {
        const text = await putRes.text().catch(() => '');
        throw new Error(`Nextcloud upload failed (${putRes.status} ${putRes.statusText}): ${text.slice(0, 200)}`);
    }

    // 3. Create a public share (so the URL is viewable without login)
    let publicUrl: string | null = null;
    let shareToken: string | null = null;
    if (cfg.publicShare) {
        const share = await createPublicShare(cfg, remotePath);
        publicUrl = share.url;
        shareToken = share.token;
    }

    return {
        webdavPath: webdavUrl,
        remotePath,
        publicUrl,
        shareToken,
        size: data.byteLength,
        mimeType,
    };
}

/** Create a public share for a file. Returns { url, token }. */
async function createPublicShare(
    cfg: NextcloudConfig,
    remotePath: string
): Promise<{ url: string; token: string }> {
    // Use the OCS Share API v2
    const url = `${cfg.baseUrl}/ocs/v2.php/apps/files_sharing/api/v1/shares`;
    const form = new URLSearchParams();
    form.set('path', remotePath);
    form.set('shareType', '3'); // 3 = public link
    form.set('permissions', '1'); // 1 = read-only
    form.set('label', 'Vital Core Radiology');

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: basicAuth(cfg),
            'OCS-APIREQUEST': 'true',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
    });
    if (!res.ok) {
        // Public shares might be disabled — that's non-fatal, return null URL.
        return { url: '', token: '' };
    }
    const xml = await res.text();
    // OCS returns XML, not JSON. Parse the <url> and <token> tags.
    const urlMatch = xml.match(/<url>\s*([^<]+?)\s*<\/url>/);
    const tokenMatch = xml.match(/<token>\s*([^<]+?)\s*<\/token>/);
    if (!urlMatch) return { url: '', token: '' };
    return {
        url: urlMatch[1].trim(),
        token: tokenMatch ? tokenMatch[1].trim() : '',
    };
}

/** Delete a file from Nextcloud. */
export async function deleteFile(remotePath: string): Promise<void> {
    const cfg = getNextcloudConfig();
    if (!isNextcloudConfigured(cfg)) {
        throw new Error('Nextcloud is not configured');
    }
    const webdavUrl = `${cfg.baseUrl}/remote.php/dav/files/${encodeURIComponent(cfg.username)}${remotePath}`;
    const res = await fetch(webdavUrl, { method: 'DELETE', headers: { Authorization: basicAuth(cfg) } });
    if (!res.ok && res.status !== 404) {
        const text = await res.text().catch(() => '');
        throw new Error(`Nextcloud delete failed (${res.status}): ${text.slice(0, 200)}`);
    }
}

/** Get a direct (possibly authenticated) URL for the file. */
export function getDirectFileUrl(shareToken: string | null, publicUrl: string | null, baseUrl: string): string | null {
    if (publicUrl) return publicUrl;
    if (shareToken && baseUrl) {
        // Construct a preview/download URL via the public-files endpoint
        return `${baseUrl}/index.php/apps/files_sharing/ajax/download.php?token=${shareToken}`;
    }
    return null;
}
