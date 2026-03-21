/**
 * PCA Task Engine
 * Implements Pavlovian Conditioned Approach with:
 * - Improved PCA index (probability + latency weighted)
 * - Devaluation logic (some trials with "devalued" reward)
 * - Trial-by-trial data collection
 */

const PCA_TASK = {
    config: {
        totalTrials: 20,
        cueDuration: 2000,     // ms - how long cue is visible before reward
        rewardDuration: 1500,   // ms - reward display
        itiMin: 1500,           // inter-trial interval
        itiMax: 2500,
        devaluationTrials: [4, 8, 12, 16, 20],  // trials where reward is "devalued"
        cueEmoji: '⭐',   // star = cue (sign)
        rewardEmoji: '🎁', // gift box = reward (goal)
        devaluedEmoji: '📦' // package = devalued reward
    },

    state: {
        trial: 0,
        trialData: [],
        cueOnset: null,
        cueShown: false,
        rewardShown: false
    },

    init() {
        this.state.trial = 0;
        this.state.trialData = [];
    },

    getNextTrial() {
        if (this.state.trial >= this.config.totalTrials) return null;
        this.state.trial++;
        const isDevalued = this.config.devaluationTrials.includes(this.state.trial);
        return {
            trialNum: this.state.trial,
            isDevalued,
            cueEmoji: this.config.cueEmoji,
            rewardEmoji: isDevalued ? this.config.devaluedEmoji : this.config.rewardEmoji
        };
    },

    recordResponse(type, latency, extra = {}) {
        if (!this.state.cueShown) return;
        this.state.trialData.push({
            trial: this.state.trial,
            response: type,  // 'sign' or 'goal'
            latency,
            cueOnset: this.state.cueOnset,
            isDevalued: this.config.devaluationTrials.includes(this.state.trial),
            ...extra
        });
    },

    setCueOnset() {
        this.state.cueOnset = performance.now();
        this.state.cueShown = true;
    },

    setRewardShown() {
        this.state.rewardShown = true;
    },

    getRandomITI() {
        return this.config.itiMin + Math.random() * (this.config.itiMax - this.config.itiMin);
    },

    /**
     * PCA Index (animal model: cue then reward, no timeout)
     * Scenario 1: Phase1 cue click + Phase2 reward click → sign-tracking
     * Scenario 2: Phase1 no cue click + Phase2 reward click → goal-tracking
     * Latency = time from cue onset to reward click. Sign-trackers tend to be slower.
     */
    computePCAIndex() {
        const data = this.state.trialData;
        if (data.length === 0) return { index: 0, phenotype: 'No data', details: {} };

        const s1 = data.filter(d => d.scenario === 1).length;
        const s2 = data.filter(d => d.scenario === 2).length;

        const totalSign = s1;
        const totalGoal = s2;
        const totalWeighted = totalSign + totalGoal;
        const probComponent = totalWeighted > 0 ? (totalSign - totalGoal) / totalWeighted : 0;

        // Latency = time to reward click. Sign-trackers slower → (avgLatencySign - avgLatencyGoal) positive
        const signTrials = data.filter(d => d.response === 'sign');
        const goalTrials = data.filter(d => d.response === 'goal');
        const avgLatencySign = signTrials.length ? signTrials.reduce((s, t) => s + t.latency, 0) / signTrials.length : null;
        const avgLatencyGoal = goalTrials.length ? goalTrials.reduce((s, t) => s + t.latency, 0) / goalTrials.length : null;
        let latencyNorm = 0;
        if (signTrials.length === 0 || goalTrials.length === 0) {
            latencyNorm = probComponent;
        } else {
            const maxLatency = Math.max(avgLatencySign, avgLatencyGoal, 1);
            const latencyComponent = (avgLatencySign - avgLatencyGoal) / maxLatency;
            latencyNorm = Math.max(-1, Math.min(1, latencyComponent));
        }

        const rawIndex = 0.7 * probComponent + 0.3 * latencyNorm;
        const index = Math.max(-1, Math.min(1, rawIndex));

        let phenotype;
        if (index > 0.33) phenotype = 'Sign-tracker';
        else if (index < -0.33) phenotype = 'Goal-tracker';
        else phenotype = 'Intermediate';

        return {
            index,
            phenotype,
            details: {
                scenario1: s1,
                scenario2: s2,
                signResponses: signTrials.length,
                goalResponses: goalTrials.length,
                totalResponses: data.length,
                totalWeighted,
                probComponent,
                latencyComponent: latencyNorm,
                avgLatencySign: signTrials.length && avgLatencySign != null ? Math.round(avgLatencySign) : null,
                avgLatencyGoal: goalTrials.length && avgLatencyGoal != null ? Math.round(avgLatencyGoal) : null
            }
        };
    },

    /**
     * Devaluation sensitivity: compare average latency on normal vs devalued trials.
     * Longer latency on devalued trials may indicate sensitivity to reward value.
     */
    computeDevaluationSensitivity() {
        const data = this.state.trialData;
        const devalued = data.filter(d => d.isDevalued && d.latency != null);
        const normal = data.filter(d => !d.isDevalued && d.latency != null);
        if (devalued.length === 0 || normal.length === 0) return null;

        const avgLatencyDevalued = devalued.reduce((s, d) => s + d.latency, 0) / devalued.length;
        const avgLatencyNormal = normal.reduce((s, d) => s + d.latency, 0) / normal.length;
        const difference = avgLatencyDevalued - avgLatencyNormal;

        return {
            avgLatencyDevalued,
            avgLatencyNormal,
            difference  // positive = slower on devalued trials
        };
    },

    getTrialData() {
        return this.state.trialData;
    },

    getConfig() {
        return { ...this.config };
    }
};
