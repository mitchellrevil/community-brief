
import { useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { PROMPT_PRESETS,  getPresetsByCategory } from "../data/prompt-presets";
import type {PromptPreset} from "../data/prompt-presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface PresetSelectorProps {
  onAppendPreset: (instruction: string) => void;
  selectedPresets?: Array<string>;
  onPresetsChange?: (presets: Array<string>) => void;
}

export function PresetSelector({ 
  onAppendPreset, 
  selectedPresets = [],
  onPresetsChange 
}: PresetSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  const presetsByCategory = getPresetsByCategory();
  const categories = Object.keys(presetsByCategory).sort();

  // Filter presets based on search term
  const getFilteredPresets = () => {
    let presets = selectedCategory 
      ? presetsByCategory[selectedCategory]
      : PROMPT_PRESETS;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      presets = presets.filter(preset => 
        preset.label.toLowerCase().includes(term) ||
        preset.instruction.toLowerCase().includes(term) ||
        preset.tags.some(tag => tag.toLowerCase().includes(term))
      );
    }

    return presets;
  };

  const handleSelectPreset = (preset: PromptPreset) => {
    const isSelected = selectedPresets.includes(preset.slug);
    
    if (isSelected) {
      // Remove preset
      const newPresets = selectedPresets.filter(s => s !== preset.slug);
      onPresetsChange?.(newPresets);
    } else {
      // Add preset
      onAppendPreset("\n\n" + preset.instruction);
      const newPresets = [...selectedPresets, preset.slug];
      onPresetsChange?.(newPresets);
    }
  };

  const handleRemovePreset = (slug: string) => {
    const newPresets = selectedPresets.filter(s => s !== slug);
    onPresetsChange?.(newPresets);
  };

  const filteredPresets = getFilteredPresets();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-muted-foreground">
          Instruction Presets
        </label>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              className="h-8 gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Preset
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-[min(92vw,38rem)] p-0" 
            align="end"
            side="bottom"
          >
            <div className="flex flex-col max-h-[70vh]">
              {/* Search and Filter Header */}
              <div className="p-4 border-b space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search presets..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                {/* Category Filter */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedCategory === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(null)}
                    className="h-7 text-xs"
                  >
                    All
                  </Button>
                  {categories.map(category => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(category)}
                      className="h-7 text-xs"
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Presets List */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                  {filteredPresets.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No presets found
                    </div>
                  ) : (
                    filteredPresets.map(preset => {
                      const isSelected = selectedPresets.includes(preset.slug);
                      return (
                        <Card 
                          key={preset.slug}
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            isSelected 
                              ? 'ring-2 ring-primary bg-primary/5' 
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => handleSelectPreset(preset)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium text-sm">
                                    {preset.label}
                                  </h4>
                                  <Badge variant="outline" className="text-xs">
                                    {preset.category}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {preset.instruction}
                                </p>
                                {preset.placeholders.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {preset.placeholders.map(placeholder => (
                                      <code 
                                        key={placeholder} 
                                        className="text-xs bg-muted px-1.5 py-0.5 rounded"
                                      >
                                        {placeholder}
                                      </code>
                                    ))}
                                  </div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {preset.tags.slice(0, 3).map(tag => (
                                    <Badge 
                                      key={tag} 
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                  {preset.tags.length > 3 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{preset.tags.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                {isSelected && (
                                  <Badge>Added</Badge>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Selected Presets Display */}
      {selectedPresets.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {selectedPresets.map(slug => {
              const preset = PROMPT_PRESETS.find(p => p.slug === slug);
              if (!preset) return null;
              
              return (
                <Badge 
                  key={slug}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  <span className="text-xs">{preset.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={() => handleRemovePreset(slug)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
