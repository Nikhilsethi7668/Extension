// Centralized Logger Utility
// Ensures consistent formatting for the vehicle posting automation system

function sanitize(value) {
    if (typeof value === 'string') {
        // Redact potential secrets if accidentally passed
        return value.replace(/(bearer\s+)[^\s]+/gi, '$1***')
                    .replace(/(key=)[^\s&]+/gi, '$1***')
                    .replace(/(password=)[^\s&]+/gi, '$1***');
    }
    return value;
}

function formatMeta(meta) {
    if (!meta) return '';
    const parts = [];
    if (meta.event) parts.push(`event=${meta.event}`);
    if (meta.traceId) parts.push(`traceId=${meta.traceId}`);
    if (meta.userId) parts.push(`userId=${meta.userId}`);
    if (meta.postingId) parts.push(`postingId=${meta.postingId}`);
    if (meta.vehicleId) parts.push(`vehicleId=${meta.vehicleId}`);
    if (meta.profileId) parts.push(`profileId=${meta.profileId}`);
    if (meta.profileUniqueId) parts.push(`profileUniqueId=${meta.profileUniqueId}`);
    
    // Add any other remaining properties
    for (const [key, value] of Object.entries(meta)) {
        if (!['event', 'traceId', 'userId', 'postingId', 'vehicleId', 'profileId', 'profileUniqueId', 'error', 'stack'].includes(key)) {
            parts.push(`${key}=${sanitize(value)}`);
        }
    }
    return parts.length > 0 ? '\n' + parts.join('\n') : '';
}

class Logger {
    static _log(level, component, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const prefix = `[${level}] [${component}]`;
        
        let output = `${timestamp}\n${prefix}`;
        if (message) {
            output += ` ${message}`;
        }
        
        output += formatMeta(meta);

        if (meta.error) {
            output += `\nerror=${meta.error}`;
            if (meta.stack) {
                output += `\nstack=${meta.stack}`;
            }
        }

        output += '\n'; // Add trailing newline for readability between logs

        if (level === 'ERROR') {
            console.error(output);
        } else if (level === 'WARN') {
            console.warn(output);
        } else {
            console.log(output);
        }
    }

    static info(component, meta = {}) {
        this._log('INFO', component, null, meta);
    }
    
    static warn(component, meta = {}) {
        this._log('WARN', component, null, meta);
    }

    static error(component, meta = {}) {
        if (meta.err && meta.err instanceof Error) {
            meta.error = meta.err.message;
            meta.stack = meta.err.stack;
            delete meta.err;
        }
        this._log('ERROR', component, null, meta);
    }

    static skip(component, meta = {}) {
        const newComponent = `${component.replace(/^\[|\]$/g, '')}][SKIP`;
        this._log('INFO', newComponent, null, meta);
    }
}

export default Logger;
