class SoprTracker {
    constructor() {
        this.dexscreenerApiUrl = 'https://api.dexscreener.com/latest/dex/tokens/';
    }

    async searchToken(address) {
        try {
            // Validate Solana address format
            if (!this.isValidSolanaAddress(address)) {
                throw new Error('Invalid Solana address format');
            }

            // Fetch token data from DexScreener
            const response = await fetch(`${this.dexscreenerApiUrl}${address}`);
            const data = await response.json();

            // Calculate SOPR
            const soprData = await this.calculateSOPR(address);
            
            // Update UI
            this.updateChart(data);
            this.displaySoprMetrics(soprData);
        } catch (error) {
            console.error('Error:', error);
            alert('Error fetching token data');
        }
    }

    isValidSolanaAddress(address) {
        // Basic Solana address validation (you might want to use a proper validation library)
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    }

    async calculateSOPR(address) {
        // This is a placeholder for SOPR calculation logic
        // You'll need to implement the actual SOPR calculation based on:
        // SOPR = Realized Value (USD) / Token Value at Time of Creation (USD)
        
        // You'll need to:
        // 1. Get historical transaction data for the token
        // 2. Track when tokens were created/acquired
        // 3. Calculate the ratio of current value to acquisition value
        
        return {
            currentSopr: 0,
            averageSopr: 0,
            soprTrend: []
        };
    }

    updateChart(tokenData) {
        // Initialize TradingView widget
        const widget = new TradingView.widget({
            container_id: 'chartContainer',
            symbol: tokenData.symbol,
            interval: 'D',
            timezone: 'Etc/UTC',
            theme: 'light',
            style: '1',
            locale: 'en',
            enable_publishing: false,
            allow_symbol_change: true,
        });
    }

    displaySoprMetrics(soprData) {
        const soprContainer = document.getElementById('soprData');
        soprContainer.innerHTML = `
            <h2>SOPR Metrics</h2>
            <p>Current SOPR: ${soprData.currentSopr.toFixed(4)}</p>
            <p>Average SOPR: ${soprData.averageSopr.toFixed(4)}</p>
            <!-- Add more SOPR-related metrics here -->
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