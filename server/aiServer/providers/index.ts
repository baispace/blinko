import { MarkdownTextSplitter, TokenTextSplitter } from '@langchain/textsplitters';
import { VECTOR_DB_FILE_PATH } from '@shared/lib/sharedConstant';
import { AiModelFactory } from '../aiModelFactory';
import { LibSQLVector } from '@mastra/libsql';

// Export the functional providers
export { LLMProvider } from './LLMProvider';
export { EmbeddingProvider } from './EmbeddingProvider';
export { AudioProvider } from './AudioProvider';

let vectorStore: LibSQLVector;

/**
 * Utility class for common AI operations
 */
export class AiUtilities {
  public static MarkdownSplitter(): MarkdownTextSplitter {
    return new MarkdownTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
    });
  }

  public static TokenTextSplitter(): TokenTextSplitter {
    return new TokenTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
    });
  }

  public static async VectorStore(): Promise<LibSQLVector> {
    if (!vectorStore) {
      vectorStore = new LibSQLVector({
        connectionUrl: VECTOR_DB_FILE_PATH,
      });
      //!index must be created before use
      await AiModelFactory.rebuildVectorIndex({ vectorStore });
    }
    return vectorStore;
  }
}
