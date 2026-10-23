import { useRouter } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { useCategories, useDeleteRule, useRules } from '../src/api/hooks';
import type { Category, Rule } from '../src/api/types';
import { AppText } from '../src/components/AppText';
import { Card } from '../src/components/Card';
import { Screen } from '../src/components/Screen';

function target(rule: Rule, byId: Map<number, Category>): string {
  const cat = rule.categoryId === null ? undefined : byId.get(rule.categoryId);
  const name = cat ? `${cat.emoji} ${cat.name}` : null;
  if (rule.flow === 'not_spending') return name ? `${name} · not spending` : 'Not spending';
  return name ?? 'Uncategorised';
}

export default function RulesScreen() {
  const router = useRouter();
  const rules = useRules().data ?? [];
  const byId = new Map((useCategories().data ?? []).map(c => [c.id, c]));
  const del = useDeleteRule();
  const sorted = [...rules].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function confirmDelete(id: number) {
    Alert.alert('Delete this rule?', 'Past transactions keep their category.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => del.mutate(id) },
    ]);
  }

  return (
    <Screen>
      <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
        <AppText tone="muted">‹ Back</AppText>
      </Pressable>
      <AppText variant="title">Rules</AppText>

      {sorted.length === 0 ? (
        <AppText tone="muted">No rules yet. Recategorise a transaction and choose "Always" to make one.</AppText>
      ) : null}

      {sorted.map(rule => (
        <Card key={rule.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" testID="rule-match">
              {rule.matchText}
            </AppText>
            <AppText>{target(rule, byId)}</AppText>
            <AppText variant="label" tone="muted">
              {rule.origin === 'user' ? 'you made this' : 'learned'}
            </AppText>
            <AppText variant="label" tone="muted">
              {rule.matches === 1 ? '1 match' : `${rule.matches} matches`}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete rule ${rule.matchText}`}
            hitSlop={8}
            onPress={() => confirmDelete(rule.id)}
          >
            <AppText tone="muted">Delete</AppText>
          </Pressable>
        </Card>
      ))}
    </Screen>
  );
}
