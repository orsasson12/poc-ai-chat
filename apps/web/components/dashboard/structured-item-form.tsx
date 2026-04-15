"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentCard } from "@/components/chat/content-card";
import {
  KNOWN_CARD_TYPES,
  CARD_TYPE_FIELDS,
  CARD_TYPE_LABELS,
} from "@/lib/knowledge/card-schemas";

interface StructuredItemFormProps {
  assistantId?: string;
}

function useStructuredItemForm(assistantId?: string) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [cardType, setCardType] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [customFields, setCustomFields] = useState<{ id: string; key: string; value: string }[]>([]);

  function resetForm() {
    setCardType("");
    setName("");
    setDescription("");
    setImageUrl("");
    setLinkUrl("");
    setFieldValues({});
    setCustomFields([]);
  }

  function buildFields(): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fieldValues)) {
      if (value.trim()) fields[key] = value.trim();
    }
    for (const { key, value } of customFields) {
      if (key.trim() && value.trim()) fields[key.trim()] = value.trim();
    }
    return fields;
  }

  // Named handler functions

  function handleCardTypeChange(type: string) {
    setCardType(type);
    setFieldValues({});
  }

  function handleCardTypeValueChange(v: string | null) {
    if (v) handleCardTypeChange(v);
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setName(e.target.value);
  }

  function handleDescriptionChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDescription(e.target.value);
  }

  function handleImageUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImageUrl(e.target.value);
  }

  function handleLinkUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLinkUrl(e.target.value);
  }

  function handleFieldChange(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  const handleSuggestedFieldChange = useCallback(
    (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFieldChange(key, e.target.value);
    },
    [],
  );

  function handleAddCustomField() {
    setCustomFields((prev) => [...prev, { id: crypto.randomUUID(), key: "", value: "" }]);
  }

  const handleCustomFieldKeyChange = useCallback(
    (fieldId: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomFields((prev) =>
        prev.map((f) => (f.id === fieldId ? { ...f, key: e.target.value } : f)),
      );
    },
    [],
  );

  const handleCustomFieldValueChange = useCallback(
    (fieldId: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomFields((prev) =>
        prev.map((f) => (f.id === fieldId ? { ...f, value: e.target.value } : f)),
      );
    },
    [],
  );

  const handleRemoveCustomField = useCallback(
    (fieldId: string) => () => {
      setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
    },
    [],
  );

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!cardType) {
      toast.error("Please select a card type");
      return;
    }

    if (!assistantId) {
      toast.success(`"${name}" added`, { description: "Structured item queued." });
      resetForm();
      return;
    }

    setLoading(true);
    try {
      const fields = buildFields();

      // Build text content for LLM context
      const contentParts = [`${cardType.replace(/_/g, " ")}: ${name}`];
      if (description.trim()) contentParts.push(description.trim());
      for (const [key, value] of Object.entries(fields)) {
        contentParts.push(`${key.replace(/_/g, " ")}: ${value}`);
      }

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          type: "structured",
          title: name.trim(),
          content: contentParts.join("\n"),
          metadata: {
            imageUrl: imageUrl.trim() || null,
            cardType,
            fields,
          },
        }),
      });

      if (res.ok) {
        toast.success(`"${name}" added to knowledge base`);
        resetForm();
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add item");
      }
    } catch {
      toast.error("Failed to add item — please try again");
    } finally {
      setLoading(false);
    }
  }

  const suggestedFields = cardType ? CARD_TYPE_FIELDS[cardType] ?? [] : [];
  const fields = buildFields();
  const hasPreviewData = name.trim() || imageUrl.trim() || Object.keys(fields).length > 0;

  return {
    loading,
    cardType,
    name,
    description,
    imageUrl,
    linkUrl,
    fieldValues,
    customFields,
    suggestedFields,
    fields,
    hasPreviewData,
    handleCardTypeValueChange,
    handleNameChange,
    handleDescriptionChange,
    handleImageUrlChange,
    handleLinkUrlChange,
    handleSuggestedFieldChange,
    handleAddCustomField,
    handleCustomFieldKeyChange,
    handleCustomFieldValueChange,
    handleRemoveCustomField,
    handleSubmit,
  };
}

export function StructuredItemForm({ assistantId }: StructuredItemFormProps) {
  const {
    loading,
    cardType,
    name,
    description,
    imageUrl,
    linkUrl,
    fieldValues,
    customFields,
    suggestedFields,
    fields,
    hasPreviewData,
    handleCardTypeValueChange,
    handleNameChange,
    handleDescriptionChange,
    handleImageUrlChange,
    handleLinkUrlChange,
    handleSuggestedFieldChange,
    handleAddCustomField,
    handleCustomFieldKeyChange,
    handleCustomFieldValueChange,
    handleRemoveCustomField,
    handleSubmit,
  } = useStructuredItemForm(assistantId);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_280px]">
      {/* Form */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="card-type">Card Type</Label>
          <Select value={cardType} onValueChange={handleCardTypeValueChange}>
            <SelectTrigger id="card-type" className="w-full">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              {KNOWN_CARD_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {CARD_TYPE_LABELS[type] ?? type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="item-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="item-name"
            placeholder="e.g. Professional Teeth Whitening"
            value={name}
            onChange={handleNameChange}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="item-description">Description</Label>
          <Textarea
            id="item-description"
            placeholder="Brief description shown to the AI for context..."
            value={description}
            onChange={handleDescriptionChange}
            rows={2}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="item-image">Image URL</Label>
            <Input
              id="item-image"
              type="url"
              placeholder="https://..."
              value={imageUrl}
              onChange={handleImageUrlChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-link">Link URL</Label>
            <Input
              id="item-link"
              type="url"
              placeholder="https://..."
              value={linkUrl}
              onChange={handleLinkUrlChange}
            />
          </div>
        </div>

        {/* Type-specific fields */}
        {suggestedFields.length > 0 && (
          <>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">
              {CARD_TYPE_LABELS[cardType] ?? cardType} fields
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {suggestedFields.map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label htmlFor={`field-${field.key}`} className="text-xs">
                    {field.label}
                  </Label>
                  <Input
                    id={`field-${field.key}`}
                    placeholder={field.placeholder}
                    value={fieldValues[field.key] ?? ""}
                    onChange={handleSuggestedFieldChange(field.key)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Custom fields */}
        {customFields.length > 0 && (
          <>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">Custom fields</p>
            <div className="space-y-2">
              {customFields.map((cf) => (
                <div key={cf.id} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`custom-key-${cf.id}`} className="text-xs">
                      Field name
                    </Label>
                    <Input
                      id={`custom-key-${cf.id}`}
                      placeholder="e.g. warranty"
                      value={cf.key}
                      onChange={handleCustomFieldKeyChange(cf.id)}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`custom-val-${cf.id}`} className="text-xs">
                      Value
                    </Label>
                    <Input
                      id={`custom-val-${cf.id}`}
                      placeholder="e.g. 2 years"
                      value={cf.value}
                      onChange={handleCustomFieldValueChange(cf.id)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Remove field"
                    onClick={handleRemoveCustomField(cf.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleAddCustomField} className="gap-1.5">
            <Plus className="size-3.5" />
            Add Field
          </Button>
        </div>

        <Separator />

        <Button onClick={handleSubmit} disabled={loading || !cardType || !name.trim()} className="gap-1.5">
          <Send className="size-4" />
          {loading ? "Adding..." : "Add Item"}
        </Button>
      </div>

      {/* Live preview */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Card Preview</p>
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-3">
          {hasPreviewData ? (
            <ContentCard
              data={{
                knowledgeItemId: "preview",
                title: name.trim() || "Untitled",
                imageUrl: imageUrl.trim() || null,
                cardType: cardType || "item",
                fields,
                sourceUrl: linkUrl.trim() || null,
              }}
            />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Fill in the form to see a preview
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
