const assert = require('node:assert/strict');
const test = require('node:test');
const { planYoutubeProduction } = require('../dist/services/youtube-planner.service.js');
const { cleanGeneratedTitle, isMalformedGeneratedText } = require('../dist/services/youtube-topic-normalizer.service.js');

const rawIdea = '1. The Deadly Invention: The Poison That Saved Millions of Lives The Hook: In 1914, German chemist Fritz Haber helped develop a weapon capable of killing on an industrial scale. The same chemistry later shaped antibiotics, sulfonamide drugs, and pharmaceutical chemistry.';

test('normalizes raw YouTube ideas before generating the production plan', () => {
  const plan = planYoutubeProduction({ topic: rawIdea, targetDurationMin: 10, angleCount: 8 });

  assert.equal(plan.topic, 'The Deadly Invention: The Poison That Saved Millions of Lives');
  assert.equal(plan.normalizedTopic.topic, 'The relationship between wartime chemistry and life-saving medicine');
  assert.match(plan.normalizedTopic.hook, /Fritz Haber/);
  assert.match(plan.normalizedTopic.hook, /\.$/);
  assert.ok(plan.normalizedTopic.entities.includes('Fritz Haber'));
  assert.ok(plan.strategy.keywords.includes('sulfonamide drugs'));
  assert.ok(plan.strategy.keywords.includes('dual-use science'));
  assert.ok(!plan.strategy.keywords.includes('the'));
  assert.ok(!JSON.stringify(plan.research).includes(rawIdea));

  const questions = plan.research.angles.flatMap((angle) => angle.questions);
  assert.equal(new Set(questions).size, questions.length);
  assert.match(questions[0], /Fritz Haber/);
  assert.equal(plan.productionMetrics.openResearchTasks, 16);
  assert.equal(plan.productionMetrics.readiness, 30);
});

test('rejects malformed generated copy before display', () => {
  assert.equal(isMalformedGeneratedText('A decade late'), true);
  assert.equal(isMalformedGeneratedText('The Hook: An incomplete title'), true);
  assert.equal(cleanGeneratedTitle('1. Origin Origin', 'Origin evidence'), 'Origin evidence');
  assert.equal(cleanGeneratedTitle('The Hook: A decade late', 'Origin evidence'), 'Origin evidence');
});
