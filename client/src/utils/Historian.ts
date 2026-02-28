import type { TelemetryPayload } from '../types/telemetry';

const BUFFER_SIZE = 3000; // 60s at 50Hz per turbine

/**
 * Pre-allocated circular buffer for incident telemetry capture.
 * Now manages a Map of circular buffers keyed by turbine ID.
 */
export class TelemetryHistorian {
    // Dictionary mapping turbine ID to its circular buffer properties
    private readonly fleet = new Map<string, {
        buffer: (TelemetryPayload | null)[];
        head: number;
        count: number;
    }>();

    private readonly size: number;

    constructor(size: number = BUFFER_SIZE) {
        this.size = size;
        this.ensureTurbine('T-01');
        this.ensureTurbine('T-02');
        this.ensureTurbine('T-03');
    }

    private ensureTurbine(id: string) {
        if (!this.fleet.has(id)) {
            this.fleet.set(id, {
                buffer: new Array<TelemetryPayload | null>(this.size).fill(null),
                head: 0,
                count: 0
            });
        }
        return this.fleet.get(id)!;
    }

    /** Write a payload into the circular buffer for the corresponding turbine. */
    add(payload: TelemetryPayload): void {
        const tState = this.ensureTurbine(payload.id);
        tState.buffer[tState.head] = payload;
        tState.head = (tState.head + 1) % this.size;
        if (tState.count < this.size) tState.count++;
    }

    /** Return the recorded sample count for a specific turbine. */
    getLength(id: string): number {
        return this.fleet.get(id)?.count || 0;
    }

    /** Retrieve the most recent N samples for a given turbine in chronological order. */
    getRecent(id: string, maxCount: number): TelemetryPayload[] {
        const tState = this.fleet.get(id);
        if (!tState || tState.count === 0) return [];

        const results: TelemetryPayload[] = [];
        const start = tState.count < this.size ? 0 : tState.head;
        const total = tState.count;

        // Optimize to only fetch the last maxCount items
        const fetchCount = Math.min(total, maxCount);
        const fetchStart = total - fetchCount;

        for (let i = 0; i < fetchCount; i++) {
            const idx = (start + fetchStart + i) % this.size;
            const entry = tState.buffer[idx];
            if (entry !== null) {
                results.push(entry);
            }
        }
        return results;
    }

    /**
     * Export the buffer of a target turbine as a CSV string in 
     * chronological order, triggering a browser download.
     */
    exportCSV(turbineId: string): void {
        const tState = this.fleet.get(turbineId);
        if (!tState || tState.count === 0) return;

        const rows: string[] = [
            '# OmniStream Incident Report',
            `# Turbine: ${turbineId}`,
            '# Limits: Vib >= 12.0 (CRITICAL), Vib >= 7.0 (WARNING)',
            'timestamp_iso,rpm,vibration_mms,temperature_c,condition'
        ];

        // Read from oldest entry to newest
        const start = tState.count < this.size ? 0 : tState.head;
        const total = tState.count;

        for (let i = 0; i < total; i++) {
            const idx = (start + i) % this.size;
            const entry = tState.buffer[idx];
            if (entry !== null) {
                let cond = 'NOMINAL';
                const absVib = Math.abs(entry.v);
                if (absVib >= 12.0) cond = 'CRITICAL';
                else if (absVib >= 7.0) cond = 'WARNING';

                const tsIso = new Date(entry.t).toISOString();
                const rStr = entry.r.toFixed(2);
                const vStr = entry.v.toFixed(2);
                const cStr = entry.c.toFixed(2);

                rows.push(`${tsIso},${rStr},${vStr},${cStr},${cond}`);
            }
        }

        const csv = rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `incident_report_${turbineId}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }
}
