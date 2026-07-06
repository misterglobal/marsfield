import 'dotenv/config';
import { disconnectRetentionService, runRetentionCleanup } from '../services/retention.service';

const apply = process.argv.includes('--apply');

runRetentionCleanup({ dryRun: !apply, batchSize: 250 })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!apply) console.log('Dry run only. Add --apply to delete the listed records and R2 objects.');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectRetentionService());
