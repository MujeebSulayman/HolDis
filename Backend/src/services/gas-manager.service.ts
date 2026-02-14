import { blockradarService } from './blockradar.service';
import { logger } from '../utils/logger';
import { ContractWriteRequest, ContractNetworkFeeResponse } from '../types/blockradar';

export class GasManagerService {
  
  async validateAndEstimateGas(
    request: Omit<ContractWriteRequest, 'reference' | 'metadata'>
  ): Promise<ContractNetworkFeeResponse> {
    try {
      logger.info('Estimating gas fees', {
        contract: request.address,
        method: request.method,
      });

            const feeEstimate = await blockradarService.estimateNetworkFee({
        address: request.address,
        method: request.method,
        parameters: request.parameters,
        abi: request.abi,
      });

      logger.info('Gas fee estimated', {
        networkFee: feeEstimate.networkFee,
        networkFeeInUSD: feeEstimate.networkFeeInUSD,
        nativeBalance: feeEstimate.nativeBalance,
        estimatedArrival: feeEstimate.estimatedArrivalTime,
      });

            const requiredBalance = BigInt(
        Math.ceil(parseFloat(feeEstimate.networkFee) * 1e18)
      );
      const availableBalance = BigInt(
        Math.ceil(parseFloat(feeEstimate.nativeBalance) * 1e18)
      );

      if (availableBalance < requiredBalance) {
        const errorMsg = `Insufficient native balance for gas fees. Required: ${feeEstimate.networkFee} ETH, Available: ${feeEstimate.nativeBalance} ETH`;
        logger.error(errorMsg, {
          required: feeEstimate.networkFee,
          available: feeEstimate.nativeBalance,
        });
        throw new Error(errorMsg);
      }

            const bufferMultiplier = 1.2;
      const requiredWithBuffer = BigInt(
        Math.ceil(parseFloat(feeEstimate.networkFee) * bufferMultiplier * 1e18)
      );

      if (availableBalance < requiredWithBuffer) {
        logger.warn('Native balance is close to minimum required for gas', {
          required: feeEstimate.networkFee,
          available: feeEstimate.nativeBalance,
          recommendedBuffer: `${feeEstimate.networkFee} * ${bufferMultiplier}`,
        });
      }

      return feeEstimate;
    } catch (error) {
      logger.error('Failed to estimate gas fees', { error, request });
      throw error;
    }
  }

  async checkGasBalance(): Promise<{
    hasEnough: boolean;
    nativeBalance: string;
    nativeBalanceInUSD: string;
  }> {
    try {
      const balance = await blockradarService.getWalletBalance();

      const hasEnough = parseFloat(balance.nativeBalance) > 0.01; 
      return {
        hasEnough,
        nativeBalance: balance.nativeBalance,
        nativeBalanceInUSD: balance.nativeBalanceInUSD,
      };
    } catch (error) {
      logger.error('Failed to check gas balance', { error });
      throw error;
    }
  }

  async estimateBatchGasCost(
    requests: Array<Omit<ContractWriteRequest, 'reference' | 'metadata'>>
  ): Promise<{
    totalGas: string;
    totalGasInUSD: string;
    estimates: ContractNetworkFeeResponse[];
  }> {
    try {
      logger.info('Estimating batch gas costs', {
        operationCount: requests.length,
      });

      const estimates = await Promise.all(
        requests.map(req => blockradarService.estimateNetworkFee({
          address: req.address,
          method: req.method,
          parameters: req.parameters,
          abi: req.abi,
        }))
      );

      const totalGas = estimates
        .reduce((sum, est) => sum + parseFloat(est.networkFee), 0)
        .toFixed(18);

      const totalGasInUSD = estimates
        .reduce((sum, est) => sum + parseFloat(est.networkFeeInUSD), 0)
        .toFixed(2);

      logger.info('Batch gas cost estimated', {
        totalGas,
        totalGasInUSD,
        operationCount: requests.length,
      });

            const balance = await blockradarService.getWalletBalance();
      const availableBalance = parseFloat(balance.nativeBalance);
      const requiredBalance = parseFloat(totalGas);

      if (availableBalance < requiredBalance) {
        const errorMsg = `Insufficient balance for batch operations. Required: ${totalGas} ETH, Available: ${balance.nativeBalance} ETH`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      return {
        totalGas,
        totalGasInUSD,
        estimates,
      };
    } catch (error) {
      logger.error('Failed to estimate batch gas cost', { error });
      throw error;
    }
  }

  getRecommendedBufferMultiplier(estimatedArrivalTime: number): number {
        if (estimatedArrivalTime > 60) {
      return 1.5;     } else if (estimatedArrivalTime > 30) {
      return 1.3;     }
    return 1.2;   }

  async monitorGasBalance(threshold: number = 0.05): Promise<void> {
    try {
      const { nativeBalance, nativeBalanceInUSD } = await blockradarService.getWalletBalance();
      const balance = parseFloat(nativeBalance);

      if (balance < threshold) {
        logger.warn('⚠️ Low gas balance detected!', {
          currentBalance: nativeBalance,
          balanceInUSD: nativeBalanceInUSD,
          threshold: threshold.toString(),
          message: 'Please fund wallet to continue operations',
        });

                      } else {
        logger.info('Gas balance check passed', {
          balance: nativeBalance,
          balanceInUSD: nativeBalanceInUSD,
        });
      }
    } catch (error) {
      logger.error('Failed to monitor gas balance', { error });
    }
  }
}

export const gasManagerService = new GasManagerService();
