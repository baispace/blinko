
export function getBlinkoEndpoint(path: string = ''): string {
    try {
        const blinkoEndpoint = getSavedEndpoint()
        const isTauri = !!(window as any).__TAURI__;
        if (isTauri && blinkoEndpoint) {
            try {
                const url = new URL(path, blinkoEndpoint.replace(/"/g, ''));
                return url.toString();
            } catch (error) {
                console.error(error);
                return new URL(path, window.location.origin).toString();
            }
        }

        return new URL(path, window.location.origin).toString();
    } catch (error) {
        console.error(error);
        return new URL(path, window.location.origin).toString();
    }
}

export function isTauriAndEndpointUndefined(): boolean {
    const isTauri = !!(window as any).__TAURI__;
    const blinkoEndpoint = getSavedEndpoint()
    return isTauri && !blinkoEndpoint;
}

export function saveBlinkoEndpoint(endpoint: string): void {
    if (endpoint) {
        window.localStorage.setItem('blinkoEndpoint', endpoint);
    }
}

export function getSavedEndpoint(): string {
    return window.localStorage.getItem('blinkoEndpoint') ||
        ((window as any).__TAURI__ ? (import.meta.env.VITE_DESKTOP_ENDPOINT || '') : '');
}
