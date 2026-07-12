import { ImportManager } from './manager';

let importManagerInstance: ImportManager | null = null;

export function getImportManager(): ImportManager {
    if (!importManagerInstance) {
        importManagerInstance = new ImportManager();
    }
    return importManagerInstance;
}

export * from './types';
export { ImportRepository } from './repository';
export { ResolverCoordinator } from './resolver';
export { ImportDatabaseService } from './database';
