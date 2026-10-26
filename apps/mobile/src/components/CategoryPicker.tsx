import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ApiError } from "../api/client";
import { useCreateCategory, useReorderCategories } from "../api/hooks";
import type { Category } from "../api/types";
import { moveItem } from "../lib/moveItem";
import { categoryColor } from "../theme/categoryColor";
import { useTheme } from "../theme/useTheme";
import { AppText, fonts } from "./AppText";
import { Button } from "./Button";
import { CategoryEditSheet } from "./CategoryEditSheet";
import { IconTile } from "./IconTile";
import { Sheet } from "./Sheet";
import { SortableList } from "./SortableList";

/** Pick a category from a searchable emoji grid, add a new one, or (in Edit) reorder, rename, restyle or delete them. */
export function CategoryPicker({
  visible,
  onClose,
  onPick,
  categories,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (categoryId: number) => void;
  categories: Category[];
}) {
  const t = useTheme();
  const create = useCreateCategory();
  const reorder = useReorderCategories();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏷️");
  const [error, setError] = useState<string | null>(null);
  // The order being edited; null when not editing.
  const [draft, setDraft] = useState<Category[] | null>(null);
  // The category whose edit sheet is open.
  const [editing, setEditing] = useState<Category | null>(null);

  // Each opening starts fresh: no old search, half-typed new category or stale error.
  useEffect(() => {
    if (!visible) return;
    setSearch("");
    setAdding(false);
    setName("");
    setEmoji("🏷️");
    setError(null);
    setDraft(null);
  }, [visible]);

  const needle = search.trim().toLowerCase();
  const shown = categories.filter((c) => c.name.toLowerCase().includes(needle));
  const canAdd = name.trim().length > 0 && emoji.trim().length > 0;

  const input = {
    backgroundColor: t.surfaceSunken,
    color: t.ink,
    fontFamily: fonts.medium,
    fontSize: 14,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  } as const;
  const arrow = {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.bg,
    alignItems: "center",
    justifyContent: "center",
  } as const;

  async function add() {
    let created;
    try {
      created = await create.mutateAsync({
        name: name.trim(),
        emoji: emoji.trim(),
        color: "line",
        kind: "spending",
      });
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "That category already exists."
          : "Couldn't add category. Try again.",
      );
      return;
    }
    setAdding(false);
    setName("");
    if (created) onPick(created.id);
  }

  function finishReorder() {
    const ids = (draft ?? [])
      .map((c) => c.id)
      .filter((id) => categories.some((c) => c.id === id));
    if (ids.some((id, i) => id !== categories[i]?.id)) reorder.mutate(ids);
    setDraft(null);
  }

  if (draft) {
    // Latest names and colours after an edit, in the draft's order; deleted ones drop out.
    const fresh = new Map(categories.map((c) => [c.id, c]));
    const rows = draft.flatMap((c) => fresh.get(c.id) ?? []);
    return (
      <>
        <Sheet visible={visible && !editing} onClose={onClose}>
          <AppText tone="muted">
            Tap a category to rename, recolour or delete it. Hold ≡ and drag, or
            use the arrows, to move it.
          </AppText>
          {/* A Modal is outside the app's root gesture view on Android, so the drag needs its own. */}
          <GestureHandlerRootView style={{ flexShrink: 1 }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <SortableList
                items={rows}
                keyOf={(c) => c.id}
                onReorder={setDraft}
                renderItem={(c, { index, handle }) => (
                  <View
                    style={{
                      height: 52,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    {handle}
                    <IconTile
                      emoji={c.emoji}
                      color={categoryColor(c.color, t)}
                      size={36}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${c.name}`}
                      onPress={() => setEditing(c)}
                      style={{ flex: 1 }}
                    >
                      <AppText variant="bodyStrong" numberOfLines={1}>
                        {c.name}
                      </AppText>
                    </Pressable>
                    {index > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${c.name} up`}
                        hitSlop={4}
                        style={arrow}
                        onPress={() =>
                          setDraft(moveItem(rows, index, index - 1))
                        }
                      >
                        <AppText>↑</AppText>
                      </Pressable>
                    ) : null}
                    {index < rows.length - 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${c.name} down`}
                        hitSlop={4}
                        style={arrow}
                        onPress={() =>
                          setDraft(moveItem(rows, index, index + 1))
                        }
                      >
                        <AppText>↓</AppText>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              />
            </ScrollView>
          </GestureHandlerRootView>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                kind="secondary"
                label="Cancel"
                onPress={() => setDraft(null)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Done" onPress={finishReorder} />
            </View>
          </View>
        </Sheet>
        {editing ? (
          <CategoryEditSheet
            visible={visible}
            category={editing}
            categories={categories}
            onClose={() => setEditing(null)}
            onMerged={() => setEditing(null)}
            onDeleted={() => setEditing(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          accessibilityLabel="Search categories"
          placeholder="Search categories"
          placeholderTextColor={t.inkFaded}
          value={search}
          onChangeText={setSearch}
          style={[input, { flex: 1 }]}
        />
        <Pressable
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => {
            setAdding(false);
            setDraft(categories);
          }}
          style={{ paddingHorizontal: 8, paddingVertical: 10 }}
        >
          <AppText variant="label">Edit</AppText>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {shown.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => onPick(c.id)}
              style={{
                width: "25%",
                alignItems: "center",
                gap: 4,
                paddingVertical: 8,
              }}
            >
              <IconTile
                emoji={c.emoji}
                color={categoryColor(c.color, t)}
                size={44}
              />
              <AppText variant="axis" numberOfLines={1}>
                {c.name}
              </AppText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setAdding(true)}
            style={{
              width: "25%",
              alignItems: "center",
              gap: 4,
              paddingVertical: 8,
            }}
          >
            <IconTile emoji="+" color={t.line} size={44} />
            <AppText variant="axis" numberOfLines={1}>
              + New category
            </AppText>
          </Pressable>
        </View>
        {adding ? (
          <View style={{ gap: 8, paddingTop: 8 }}>
            <TextInput
              accessibilityLabel="Category name"
              placeholder="Name"
              placeholderTextColor={t.inkFaded}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError(null);
              }}
              maxLength={40}
              style={input}
            />
            <TextInput
              accessibilityLabel="Category emoji"
              placeholder="Emoji"
              placeholderTextColor={t.inkFaded}
              value={emoji}
              onChangeText={setEmoji}
              maxLength={8}
              style={input}
            />
            {error ? <AppText tone="muted">{error}</AppText> : null}
            <Button
              label="Add category"
              onPress={add}
              disabled={!canAdd || create.isPending}
            />
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
