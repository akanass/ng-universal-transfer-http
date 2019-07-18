import { Inject, Injectable, Optional } from '@angular/core';
import { NG_UNIVERSAL_TRANSFER_HTTP_CONFIG } from '../../global/tokens';
import { TransferHttpCacheConfig } from '../../global/interfaces';

@Injectable()
export class TransferHttpCacheConfigService {
    // private property to store config
    private readonly _config: TransferHttpCacheConfig;

    /**
     * Class constructor
     */
    constructor(@Optional() @Inject(NG_UNIVERSAL_TRANSFER_HTTP_CONFIG) private _transferHttpCacheConfig: TransferHttpCacheConfig) {
        this._config = { prodMode: true };
        if (this._transferHttpCacheConfig !== null) {
            Object.assign(this._config, this._transferHttpCacheConfig);
        }
    }

    /**
     * Returns private property _config
     */
    get config(): TransferHttpCacheConfig {
        return this._config;
    }
}
