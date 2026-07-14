import { RedisStore } from '../packages/store/src/redis-store';

async function debug() {
  const store = new RedisStore('redis://localhost:6379');
  await store.connect();
  await store.clearStore();

  // 1. Enqueue and claim a job
  const job = await store.enqueueJob('email', { to: 'test@test.com' });
  console.log('1. Enqueued:', job.id, job.state);

  await store.registerWorker('debug-worker');
  const claimed = await store.claimJob('debug-worker');
  console.log('2. Claimed:', claimed?.id, claimed?.state, claimed?.workerId);

  // 2. Check worker has currentJobId
  let worker = await store.getWorker('debug-worker');
  console.log('3. Worker currentJobId:', worker?.currentJobId);
  console.log('4. Worker status:', worker?.status);
  console.log('5. Worker lastHeartbeat:', worker?.lastHeartbeatAt);

  // 3. Wait and mark dead
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\n--- After waiting 2 seconds ---');
  worker = await store.getWorker('debug-worker');
  console.log('6. Worker lastHeartbeat:', worker?.lastHeartbeatAt);
  
  const deadWorkers = await store.markDeadWorkers(1000);
  console.log('7. Dead workers found:', deadWorkers.length);
  deadWorkers.forEach(w => console.log(`   - ${w.id}: ${w.status}, job: ${w.currentJobId}`));

  // 4. Try reclaim
  console.log('\n--- Attempting reclaim ---');
  const reclaimed = await store.reclaimJobsFromDeadWorkers(1000);
  console.log('8. Reclaimed jobs:', reclaimed.length);
  reclaimed.forEach(j => console.log(`   - ${j.id}: ${j.state}`));

  await store.disconnect();
}

debug().catch(console.error);
