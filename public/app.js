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

            // Get token data from Solscan
            const tokenData = await this.getTokenHistory(address);
            console.log('Solscan token data:', tokenData);
            
            if (!tokenData) {
                throw new Error('Token not found on Solscan');
            }

            // Calculate SOPR
            const soprData = await this.calculateSOPR(address);
            
            // Update UI with chart and metrics
            await this.updateChart(address, tokenData);
            this.displaySoprMetrics(soprData);
        } catch (error) {
            console.error('Error:', error);
            document.getElementById('soprData').innerHTML = `
                <div class="error">
                    <h3>Error</h3>
                    <p>${error.message}</p>
                    <p>Please try again with a valid token address.</p>
                </div>
            `;
        }
    }

    isValidSolanaAddress(address) {
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    }

    async updateChart(tokenAddress, tokenData) {
        const ctx = document.getElementById('tokenChart').getContext('2d');
        
        // Destroy existing chart if it exists
        if (this.chart) {
            this.chart.destroy();
        }

        try {
            // Format Solscan price data
            const priceData = this.formatPriceData(tokenData);
            
            // Create new chart
            this.chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: priceData.timestamps,
                    datasets: [{
                        label: `Token Price`,
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
                            text: `Price Chart`
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

    formatPriceData(tokenData) {
        // Format Solscan price data for Chart.js
        const timestamps = [];
        const prices = [];

        if (tokenData && tokenData.priceHistory) {
            tokenData.priceHistory.forEach(point => {
                timestamps.push(new Date(point.time * 1000).toLocaleDateString());
                prices.push(point.price);
            });
        }

        return { timestamps, prices };
    }

    async getTokenHistory(tokenAddress) {
        try {
            // Get historical data from Solscan
            const response = await this.rateLimitedRequest(
                `https://public-api.solscan.io/market/token/${tokenAddress}`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                }
            );

            console.log('Solscan token history:', response);
            return response;
        } catch (error) {
            console.error('Error fetching token history:', error);
            return null;
        }
    }

    async calculateSOPR(address) {
        try {
            console.log('Starting SOPR calculation for address:', address);
            const soprContainer = document.getElementById('soprData');
            soprContainer.innerHTML = '<p>Fetching token data...</p>';

            // Get token history from Solscan
            const tokenHistory = await this.getTokenHistory(address);
            if (!tokenHistory) {
                throw new Error('Unable to fetch token history');
            }

            // Get holder transactions
            const holders = await this.getTokenHolders(address);
            console.log('Found holders:', holders.length);

            this.updateProgress(0, holders.length);
            let totalSopr = 0;
            let validTransactions = 0;

            for (let i = 0; i < holders.length; i++) {
                const holder = holders[i];
                this.updateProgress(i + 1, holders.length);

                try {
                    // Get holder's transaction history from Solscan
                    const holderTransactions = await this.rateLimitedRequest(
                        `https://public-api.solscan.io/account/token/txs?token_address=${address}&account=${holder.address}`,
                        {
                            headers: {
                                'Accept': 'application/json',
                                'User-Agent': 'Mozilla/5.0'
                            }
                        }
                    );

                    if (holderTransactions && holderTransactions.length > 0) {
                        // Sort transactions by timestamp
                        const sortedTxs = holderTransactions.sort((a, b) => a.blockTime - b.blockTime);
                        
                        // Find first buy and last sell
                        const firstBuy = sortedTxs.find(tx => tx.changeAmount > 0);
                        const lastSell = [...sortedTxs].reverse().find(tx => tx.changeAmount < 0);

                        if (firstBuy && lastSell) {
                            // Get prices at buy and sell times
                            const buyPrice = this.getPriceAtTimestamp(tokenHistory, firstBuy.blockTime);
                            const sellPrice = this.getPriceAtTimestamp(tokenHistory, lastSell.blockTime);

                            if (buyPrice && sellPrice) {
                                const sopr = sellPrice / buyPrice;
                                console.log(`SOPR for holder ${holder.address}:`, {
                                    buyPrice,
                                    sellPrice,
                                    sopr
                                });
                                totalSopr += sopr;
                                validTransactions++;
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing holder ${holder.address}:`, error);
                }
            }

            const averageSopr = validTransactions > 0 ? totalSopr / validTransactions : 0;
            return {
                currentSopr: averageSopr,
                averageSopr: this.calculateMovingAverage(averageSopr),
                soprTrend: this.calculateTrend(averageSopr),
                isProfit: averageSopr > 1,
                trend: this.getTrendDescription(averageSopr),
                holders: holders.length,
                validTransactions
            };
        } catch (error) {
            console.error('Error in SOPR calculation:', error);
            throw new Error(`SOPR calculation failed: ${error.message}`);
        }
    }

    getPriceAtTimestamp(tokenHistory, timestamp) {
        // Find the closest price data point to the given timestamp
        const pricePoint = tokenHistory.find(point => 
            Math.abs(point.timestamp - timestamp) < 3600 // Within 1 hour
        );
        return pricePoint ? pricePoint.price : null;
    }

    async getTokenHolders(tokenAddress) {
        try {
            const connection = new solanaWeb3.Connection(
                'https://api.mainnet-beta.solana.com',
                'confirmed'
            );

            // Get the token mint info
            const mintPubkey = new solanaWeb3.PublicKey(tokenAddress);
            const mintInfo = await connection.getAccountInfo(mintPubkey);
            
            if (!mintInfo) {
                throw new Error('Token not found');
            }

            console.log('Getting token accounts...');
            // Get all token accounts for this mint
            const tokenAccounts = await connection.getTokenLargestAccounts(mintPubkey);
            console.log('Token accounts:', tokenAccounts);

            // Get detailed info for each holder
            const holders = await Promise.all(
                tokenAccounts.value.map(async account => {
                    const accountInfo = await connection.getParsedAccountInfo(account.address);
                    const parsedInfo = accountInfo.value.data.parsed.info;
                    
                    return {
                        address: parsedInfo.owner,
                        amount: account.amount,
                        uiAmount: account.uiAmount,
                        decimals: parsedInfo.tokenAmount.decimals
                    };
                })
            );

            console.log('Processed holders:', holders);
            return holders.filter(h => h.uiAmount > 0); // Only return active holders
        } catch (error) {
            console.error('Error fetching token holders:', error);
            throw new Error(`Failed to fetch holders: ${error.message}`);
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
            <div class="sopr-metrics">
                <p>Current SOPR: <span style="color: ${trendColor}">${soprData.currentSopr.toFixed(4)}</span></p>
                <p>Average SOPR (14-day): ${soprData.averageSopr.toFixed(4)}</p>
                <p>Total Holders Analyzed: ${soprData.holders}</p>
                <p>Valid Transactions: ${soprData.validTransactions}</p>
                <p>Trend: ${soprData.trend} ${trendArrow}</p>
                <div class="sopr-trend-strength">
                    Trend Strength: ${(soprData.soprTrend.strength || 0).toFixed(2)}
                </div>
            </div>
            <div class="sopr-explanation">
                <h3>Understanding SOPR (Spent Output Profit Ratio)</h3>
                <p>SOPR measures the profit ratio of tokens being moved by comparing their value when bought vs when sold.</p>
                <ul>
                    <li>SOPR > 1: Tokens are being sold in profit</li>
                    <li>SOPR < 1: Tokens are being sold at a loss</li>
                    <li>SOPR = 1: Break-even point</li>
                </ul>
                <div class="sopr-formula">
                    <h4>Formula:</h4>
                    <p>SOPR = Value when sold (USD) / Value when bought (USD)</p>
                </div>
                <div class="sopr-interpretation">
                    <h4>Current Status:</h4>
                    <p>${soprData.trend}</p>
                    <p>Trend Direction: ${soprData.soprTrend.direction} ${trendArrow}</p>
                </div>
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