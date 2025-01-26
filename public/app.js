async searchToken(address) {
    try {
        const soprContainer = document.getElementById('soprData');
        soprContainer.innerHTML = '<p>Loading...</p>'; // Add loading indicator
        
        // Validate Solana address format
        if (!this.isValidSolanaAddress(address)) {
            throw new Error('Invalid Solana address format');
        }

        // Fetch token data from DexScreener
        const response = await fetch(`${this.dexscreenerApiUrl}${address}`);
        const data = await response.json();
        
        if (!data.pairs || data.pairs.length === 0) {
            throw new Error('Token not found on DexScreener');
        }

        // Calculate SOPR
        const soprData = await this.calculateSOPR(address);
        
        // Update UI
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