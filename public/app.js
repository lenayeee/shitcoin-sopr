class SoprTracker {
    constructor() {
        this.dexscreenerApiUrl = 'https://api.dexscreener.com/latest/dex/tokens/';
        this.historicalData = []; // Store historical SOPR values
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
        
        console.log('Updating chart with pair data:', pairData);
        
        // Extract the correct trading pair
        const symbol = `${pairData.dexId}:${pairData.baseToken.symbol}${pairData.quoteToken.symbol}`;
        console.log('Chart symbol:', symbol);

        // Create TradingView widget
        new TradingView.widget({
            container_id: 'chartContainer',
            symbol: symbol,
            interval: '60',
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
            studies: [
                'RSI@tv-basicstudies',
                'MASimple@tv-basicstudies',
                'MACD@tv-basicstudies'
            ],
            show_popup_button: true,
            popup_width: '1000',
            popup_height: '650'
        });
    }

    async calculateSOPR(address) {
        try {
            // This would need to be connected to a Solana blockchain API
            const transactions = await this.getWalletTransactions(address);
            
            let totalProfit = 0;
            let totalTransactions = 0;
            
            for (const tx of transactions) {
                const buyPrice = tx.initialBuyPrice;  // USD value when bought
                const currentPrice = tx.currentPrice;  // USD value when sold/moved
                
                if (buyPrice && currentPrice) {
                    const profit = (currentPrice - buyPrice) / buyPrice;
                    totalProfit += profit;
                    totalTransactions++;
                }
            }
            
            const sopr = totalTransactions > 0 ? totalProfit / totalTransactions : 0;
            
            return {
                currentSopr: sopr,
                averageSopr: this.calculateMovingAverage(sopr),
                soprTrend: this.calculateTrend(sopr),
                isProfit: sopr > 0,
                trend: this.getTrendDescription(sopr)
            };
        } catch (error) {
            console.error('Error calculating SOPR:', error);
            return {
                currentSopr: 0,
                averageSopr: 0,
                soprTrend: [],
                isProfit: false,
                trend: 'Unable to calculate'
            };
        }
    }

    // Helper methods for SOPR calculation
    getTrendDescription(sopr) {
        if (sopr > 0) {
            return 'Coins are currently in profit overall';
        } else if (sopr < 0) {
            return 'Coins are currently being sold at a loss';
        }
        return 'Break-even point';
    }

    async getWalletTransactions(address) {
        try {
            // Using Solana Web3.js to get transaction history
            const connection = new solanaWeb3.Connection(
                'https://api.mainnet-beta.solana.com'
            );
            
            const transactions = await connection.getConfirmedSignaturesForAddress2(
                new solanaWeb3.PublicKey(address),
                { limit: 100 } // Get last 100 transactions
            );

            const processedTxs = [];
            
            for (const tx of transactions) {
                const txInfo = await connection.getTransaction(tx.signature);
                if (txInfo && txInfo.meta) {
                    const timestamp = txInfo.blockTime * 1000; // Convert to milliseconds
                    const preBalance = txInfo.meta.preBalances[0];
                    const postBalance = txInfo.meta.postBalances[0];
                    
                    processedTxs.push({
                        timestamp,
                        initialBuyPrice: preBalance / 1e9, // Convert lamports to SOL
                        currentPrice: postBalance / 1e9,
                        type: preBalance > postBalance ? 'sell' : 'buy'
                    });
                }
            }
            
            return processedTxs;
        } catch (error) {
            console.error('Error fetching transactions:', error);
            return [];
        }
    }

    calculateMovingAverage(currentSopr, period = 14) {
        this.historicalData.push(currentSopr);
        
        // Keep only the last 'period' number of data points
        if (this.historicalData.length > period) {
            this.historicalData = this.historicalData.slice(-period);
        }
        
        // Calculate simple moving average
        const sum = this.historicalData.reduce((a, b) => a + b, 0);
        return this.historicalData.length > 0 ? sum / this.historicalData.length : 0;
    }

    calculateTrend(currentSopr) {
        const trendPeriod = 5; // Look at last 5 data points
        const recentData = this.historicalData.slice(-trendPeriod);
        
        if (recentData.length < 2) return [];
        
        // Calculate the trend line using linear regression
        const xValues = Array.from({ length: recentData.length }, (_, i) => i);
        const yValues = recentData;
        
        const { slope } = this.linearRegression(xValues, yValues);
        
        return {
            direction: slope > 0 ? 'up' : slope < 0 ? 'down' : 'neutral',
            strength: Math.abs(slope),
            data: recentData
        };
    }

    linearRegression(x, y) {
        const n = x.length;
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumXX = 0;
        
        for (let i = 0; i < n; i++) {
            sumX += x[i];
            sumY += y[i];
            sumXY += x[i] * y[i];
            sumXX += x[i] * x[i];
        }
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        return { slope, intercept };
    }

    // Update the displaySoprMetrics to include trend information
    displaySoprMetrics(soprData) {
        const soprContainer = document.getElementById('soprData');
        const trendColor = soprData.isProfit ? '#4CAF50' : '#ff4444';
        const trendArrow = soprData.soprTrend.direction === 'up' ? '↑' : 
                          soprData.soprTrend.direction === 'down' ? '↓' : '→';
        
        soprContainer.innerHTML = `
            <h2>SOPR Metrics</h2>
            <p>Current SOPR: <span style="color: ${trendColor}">${soprData.currentSopr.toFixed(4)}</span></p>
            <p>Average SOPR (14-day): ${soprData.averageSopr.toFixed(4)}</p>
            <p>Trend: ${soprData.trend} ${trendArrow}</p>
            <div class="sopr-trend-strength">
                Trend Strength: ${(soprData.soprTrend.strength || 0).toFixed(2)}
            </div>
            <div class="sopr-explanation">
                <h3>What does this mean?</h3>
                <ul>
                    <li>SOPR > 0: Coins are in profit</li>
                    <li>SOPR < 0: Coins are at a loss</li>
                    <li>Trending Up ${trendArrow}: Increasing realized profits</li>
                    <li>Trending Down ${trendArrow}: Decreasing realized profits</li>
                </ul>
            </div>
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