class SoprTracker {
    constructor() {
        this.dexscreenerApiUrl = 'https://api.dexscreener.com/latest/dex/tokens/';
        console.log('SoprTracker initialized');
    }

    async searchToken(address) {
        try {
            console.log('Searching for token:', address);
            const soprContainer = document.getElementById('soprData');
            soprContainer.innerHTML = '<p>Loading...</p>'; // Add loading indicator
            
            // Validate Solana address format
            if (!this.isValidSolanaAddress(address)) {
                throw new Error('Invalid Solana address format');
            }

            console.log('Fetching data from DexScreener...');
            // Fetch token data from DexScreener
            const response = await fetch(`${this.dexscreenerApiUrl}${address}`);
            const data = await response.json();
            console.log('DexScreener data:', data);
            
            if (!data.pairs || data.pairs.length === 0) {
                throw new Error('Token not found on DexScreener');
            }

            // Calculate SOPR
            const soprData = await this.calculateSOPR(address);
            console.log('SOPR data:', soprData);
            
            // Update UI with chart and metrics
            this.updateChart(data.pairs[0]);
            this.displaySoprMetrics(soprData);
        } catch (error) {
            console.error('Error:', error);
            document.getElementById('soprData').innerHTML = `
                <div class="error">
                    Error: ${error.message}
                </div>
            `;
        }
    }

    isValidSolanaAddress(address) {
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    }

    updateChart(pairData) {
        const chartContainer = document.getElementById('chartContainer');
        chartContainer.innerHTML = ''; // Clear previous chart

        // Create TradingView widget
        new TradingView.widget({
            container_id: 'chartContainer',
            symbol: `${pairData.baseToken.symbol}USD`,
            interval: 'D',
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',
            locale: 'en',
            toolbar_bg: '#f1f3f6',
            enable_publishing: false,
            allow_symbol_change: true,
            width: '100%',
            height: 500,
            save_image: false,
        });
    }

    async calculateSOPR(address) {
        // Placeholder for SOPR calculation
        return {
            currentSopr: Math.random() * 2,
            averageSopr: Math.random() * 1.5,
            soprTrend: []
        };
    }

    displaySoprMetrics(soprData) {
        const soprContainer = document.getElementById('soprData');
        soprContainer.innerHTML = `
            <h2>SOPR Metrics</h2>
            <p>Current SOPR: ${soprData.currentSopr.toFixed(4)}</p>
            <p>Average SOPR: ${soprData.averageSopr.toFixed(4)}</p>
        `;
    }
}

// Initialize the tracker
const tracker = new SoprTracker();

// Search function to be called from the HTML
function searchToken() {
    const address = document.getElementById('tokenSearch').value;
    tracker.searchToken(address);
} 