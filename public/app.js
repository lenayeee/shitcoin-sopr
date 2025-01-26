class SoprTracker {
    constructor() {
        this.dexscreenerApiUrl = 'https://api.dexscreener.com/latest/dex/tokens/';
        this.historicalData = []; // Store historical SOPR values
        this.chart = null;
        
        // Rate limiting settings
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.rateLimit = {
            maxRequests: 10,    // Maximum requests per time window
            timeWindow: 60000,  // Time window in milliseconds (1 minute)
            requestCount: 0,
            lastReset: Date.now()
        };
        
        console.log('SoprTracker initialized');
    }

    async searchToken(address) {
        try {
            console.log('Searching for token:', address);
            const soprContainer = document.getElementById('soprData');
            soprContainer.innerHTML = '<p>Loading...</p>';
            
            if (!this.isValidSolanaAddress(address)) {
                throw new Error('Invalid Solana address format');
            }

            // Fetch token data from DexScreener
            const response = await fetch(`${this.dexscreenerApiUrl}${address}`);
            const data = await response.json();
            
            // Log the full response for debugging
            console.log('DexScreener full response:', data);
            
            if (!data.pairs || data.pairs.length === 0) {
                throw new Error('Token not found on DexScreener');
            }

            // Calculate SOPR
            const soprData = await this.calculateSOPR(address);
            
            // Update UI with chart and metrics
            await this.updateChart(data.pairs[0]);
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

    async updateChart(pairData) {
        const ctx = document.getElementById('tokenChart').getContext('2d');
        
        // Destroy existing chart if it exists
        if (this.chart) {
            this.chart.destroy();
        }

        try {
            // Fetch historical price data
            const priceData = await this.fetchHistoricalPrices(pairData.pairAddress);
            
            // Create new chart
            this.chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: priceData.timestamps,
                    datasets: [{
                        label: `${pairData.baseToken.symbol} Price`,
                        data: priceData.prices,
                        borderColor: 'rgb(75, 192, 192)',
                        tension: 0.1,
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `${pairData.baseToken.symbol}/${pairData.quoteToken.symbol} Price Chart`
                        },
                        legend: {
                            position: 'top',
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            });
        } catch (error) {
            console.error('Error creating chart:', error);
            document.getElementById('chartContainer').innerHTML = `
                <div class="error">
                    Error loading chart: ${error.message}
                </div>
            `;
        }
    }

    async fetchHistoricalPrices(pairAddress) {
        // This is a placeholder - you'll need to implement actual historical data fetching
        // You could use DexScreener's API or another data source
        const timestamps = [];
        const prices = [];
        const now = Date.now();
        
        // Generate sample data for the last 30 days
        for (let i = 30; i >= 0; i--) {
            timestamps.push(new Date(now - i * 24 * 60 * 60 * 1000).toLocaleDateString());
            prices.push(Math.random() * 100); // Replace with actual price data
        }
        
        return { timestamps, prices };
    }

    async calculateSOPR(address) {
        try {
            console.log('Calculating SOPR for address:', address);
            
            // Get current token price from DexScreener
            const dexScreenerResponse = await fetch(`${this.dexscreenerApiUrl}${address}`);
            const dexData = await dexScreenerResponse.json();
            const currentPrice = dexData.pairs[0].priceUsd;

            // Get holder data from Solscan
            const holders = await this.getTokenHolders(address);
            console.log('Token holders:', holders);

            let totalSopr = 0;
            let validTransactions = 0;

            for (const holder of holders) {
                const holderTransactions = await this.getHolderTransactions(address, holder.address);
                
                // Get first buy transaction
                const firstBuy = holderTransactions.find(tx => tx.type === 'buy');
                // Get last sell transaction (if exists)
                const lastSell = holderTransactions.reverse().find(tx => tx.type === 'sell');

                if (firstBuy && lastSell) {
                    const sopr = lastSell.priceUsd / firstBuy.priceUsd;
                    totalSopr += sopr;
                    validTransactions++;
                }
            }

            const averageSopr = validTransactions > 0 ? totalSopr / validTransactions : 0;
            console.log('Calculated SOPR:', averageSopr);

            return {
                currentSopr: averageSopr,
                averageSopr: this.calculateMovingAverage(averageSopr),
                soprTrend: this.calculateTrend(averageSopr),
                isProfit: averageSopr > 1,
                trend: this.getTrendDescription(averageSopr)
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

    async getTokenHolders(tokenAddress) {
        try {
            const data = await this.rateLimitedRequest(
                `https://public-api.solscan.io/token/holders?tokenAddress=${tokenAddress}`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                }
            );
            
            console.log('Solscan holders data:', data);
            return data.data || [];
        } catch (error) {
            console.error('Error fetching token holders:', error);
            return [];
        }
    }

    async getHolderTransactions(tokenAddress, holderAddress) {
        try {
            const data = await this.rateLimitedRequest(
                `https://public-api.solscan.io/account/token/txs?token_address=${tokenAddress}&account=${holderAddress}`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                }
            );
            
            console.log(`Transactions for holder ${holderAddress}:`, data);
            
            return data.map(tx => ({
                timestamp: tx.blockTime * 1000,
                type: this.determineTransactionType(tx),
                priceUsd: tx.price || 0,
                amount: tx.amount || 0
            }));
        } catch (error) {
            console.error('Error fetching holder transactions:', error);
            return [];
        }
    }

    determineTransactionType(tx) {
        // Logic to determine if transaction is buy or sell
        // This will depend on Solscan's transaction data structure
        if (tx.changeAmount > 0) {
            return 'buy';
        } else if (tx.changeAmount < 0) {
            return 'sell';
        }
        return 'unknown';
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

    // Helper methods for SOPR calculation
    getTrendDescription(sopr) {
        if (sopr > 1) {
            return 'Holders are in profit';
        } else if (sopr < 1) {
            return 'Holders are at a loss';
        }
        return 'Break-even point';
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

    // Add rate limiting helper methods
    async rateLimitedRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ url, options, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) return;

        this.isProcessingQueue = true;

        try {
            // Check if we need to reset the counter
            const now = Date.now();
            if (now - this.rateLimit.lastReset >= this.rateLimit.timeWindow) {
                this.rateLimit.requestCount = 0;
                this.rateLimit.lastReset = now;
            }

            // Process queue if we haven't hit the rate limit
            while (this.requestQueue.length > 0 && this.rateLimit.requestCount < this.rateLimit.maxRequests) {
                const request = this.requestQueue.shift();
                this.rateLimit.requestCount++;

                try {
                    const response = await fetch(request.url, request.options);
                    const data = await response.json();
                    request.resolve(data);
                } catch (error) {
                    request.reject(error);
                }

                // Add delay between requests
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // If we hit the rate limit, schedule the next batch
            if (this.requestQueue.length > 0) {
                const timeToReset = this.rateLimit.timeWindow - (Date.now() - this.rateLimit.lastReset);
                setTimeout(() => this.processQueue(), timeToReset);
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    // Add progress indicator for UI
    updateProgress(current, total) {
        const soprContainer = document.getElementById('soprData');
        soprContainer.innerHTML = `
            <div class="progress">
                <p>Processing holders: ${current}/${total}</p>
                <div class="progress-bar" style="width: ${(current/total) * 100}%"></div>
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