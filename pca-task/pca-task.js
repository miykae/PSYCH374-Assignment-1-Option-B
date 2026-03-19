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
        cueDuration: 2000,      // ms - how long cue is visible before reward
        rewardDuration: 1500,    // ms - reward display
        itiMin: 1500,           // inter-trial interval
        itiMax: 2500,
        devaluationTrials: [4, 8, 12, 16],  // trials where reward is "devalued"
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

    recordResponse(type, latency) {
        if (!this.state.cueShown) return;
        this.state.trialData.push({
            trial: this.state.trial,
            response: type,  // 'sign' or 'goal'
            latency,
            cueOnset: this.state.cueOnset,
            isDevalued: this.config.devaluationTrials.includes(this.state.trial)
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
     * Improved PCA Index Calculation
     * Based on: probability of sign vs goal response + latency (faster = stronger tendency)
     * Index range: -1 (pure goal-tracker) to +1 (pure sign-tracker)
     */
    computePCAIndex() {
        const data = this.state.trialData;
        if (data.length === 0) return { index: 0, phenotype: 'No data', details: {} };

        const signTrials = data.filter(d => d.response === 'sign');
        const goalTrials = data.filter(d => d.response === 'goal');
        const total = data.length;

        // Probability component: proportion of sign vs goal responses
        const pSign = signTrials.length / total;
        const pGoal = goalTrials.length / total;
        const probComponent = (pSign - pGoal);  // -1 to +1

        // Latency component: faster responses indicate stronger tendency
        // Lower latency to sign = more sign-tracking; lower latency to goal = more goal-tracking
        const avgLatencySign = signTrials.length ? signTrials.reduce((s, t) => s + t.latency, 0) / signTrials.length : null;
        const avgLatencyGoal = goalTrials.length ? goalTrials.reduce((s, t) => s + t.latency, 0) / goalTrials.length : null;
        let latencyNorm = 0;
        if (signTrials.length === 0 || goalTrials.length === 0) {
            // One-sided data: align latency with probability so index reaches ±1
            latencyNorm = probComponent;
        } else if (signTrials.length > 0 && goalTrials.length > 0) {
            const maxLatency = Math.max(avgLatencySign, avgLatencyGoal, 1);
            const latencyComponent = (avgLatencyGoal - avgLatencySign) / maxLatency;
            latencyNorm = Math.max(-1, Math.min(1, latencyComponent));
        }

        // Combined index: 70% probability, 30% latency (latency is noisier)
        const rawIndex = 0.7 * probComponent + 0.3 * latencyNorm;
        const index = Math.max(-1, Math.min(1, rawIndex));

        // Phenotype classification
        let phenotype;
        if (index > 0.33) phenotype = 'Sign-tracker';
        else if (index < -0.33) phenotype = 'Goal-tracker';
        else phenotype = 'Intermediate';

        return {
            index,
            phenotype,
            details: {
                signResponses: signTrials.length,
                goalResponses: goalTrials.length,
                totalResponses: total,
                pSign,
                pGoal,
                avgLatencySign: signTrials.length && avgLatencySign != null ? Math.round(avgLatencySign) : null,
                avgLatencyGoal: goalTrials.length && avgLatencyGoal != null ? Math.round(avgLatencyGoal) : null,
                probComponent,
                latencyComponent: latencyNorm
            }
        };
    },

    /**
     * Devaluation sensitivity: do sign-trackers respond more to cue even when reward is devalued?
     */
    computeDevaluationSensitivity() {
        const data = this.state.trialData;
        const devalued = data.filter(d => d.isDevalued);
        const normal = data.filter(d => !d.isDevalued);
        if (devalued.length === 0 || normal.length === 0) return null;

        const pSignDevalued = devalued.filter(d => d.response === 'sign').length / devalued.length;
        const pSignNormal = normal.filter(d => d.response === 'sign').length / normal.length;
        return {
            pSignDevalued,
            pSignNormal,
            difference: pSignDevalued - pSignNormal  // positive = less sensitive to devaluation (more sign-tracky)
        };
    },

    getTrialData() {
        return this.state.trialData;
    },

    getConfig() {
        return { ...this.config };
    }
};
