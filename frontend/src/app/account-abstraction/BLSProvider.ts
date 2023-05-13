import { JsonRpcProvider } from '@ethersproject/providers';
import {
  EntryPoint__factory,
  SimpleAccountFactory__factory,
} from '@account-abstraction/contracts';
import {
  ClientConfig,
  ERC4337EthersProvider,
  HttpRpcClient,
  DeterministicDeployer,
} from '@account-abstraction/sdk';
import { Signer } from '@ethersproject/abstract-signer';
import { signer } from '@thehubbleproject/bls';
import Debug from 'debug';

import { BLSAccountAPI } from './BLSAccountAPI';

const debug = Debug('aa.bls.wrapProvider');

const getBLSSigner = async (): Promise<signer.BlsSignerInterface> => {
  const privateKey = '0xabc123';
  const domain = 'notthebeeeeeeees';

  const blsSignerFactory = await signer.BlsSignerFactory.new();
  return blsSignerFactory.getSigner(domain, privateKey);
};

/**
 * wrap an existing provider to tunnel requests through Account Abstraction.
 * @param originalProvider the normal provider
 * @param config see ClientConfig for more info
 * @param originalSigner use this signer as the owner. of this wallet. By default, use the provider's signer
 */
export async function wrapProvider(
  originalProvider: JsonRpcProvider,
  config: ClientConfig,
  originalSigner: Signer = originalProvider.getSigner(),
): Promise<ERC4337EthersProvider> {
  const entryPoint = EntryPoint__factory.connect(
    config.entryPointAddress,
    originalProvider,
  );
  // Initial SimpleAccount instance is not deployed and exists just for the interface
  const detDeployer = new DeterministicDeployer(originalProvider);
  const SimpleAccountFactory = await detDeployer.deterministicDeploy(
    new SimpleAccountFactory__factory(),
    0,
    [entryPoint.address],
  );

  const smartAccountAPI = new BLSAccountAPI({
    provider: originalProvider,
    entryPointAddress: entryPoint.address,
    blsSigner: await getBLSSigner(),
    factoryAddress: SimpleAccountFactory,
    paymasterAPI: config.paymasterAPI,
  });
  debug('config=', config);
  const chainId = await originalProvider
    .getNetwork()
    .then((net) => net.chainId);
  const httpRpcClient = new HttpRpcClient(
    config.bundlerUrl,
    config.entryPointAddress,
    chainId,
  );
  return await new ERC4337EthersProvider(
    chainId,
    config,
    // TODO What is this signer needed for?
    originalSigner,
    originalProvider,
    httpRpcClient,
    entryPoint,
    smartAccountAPI,
  ).init();
}
