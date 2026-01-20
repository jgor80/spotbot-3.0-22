import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Trophy } from "lucide-react";

interface CreateTournamentFormProps {
  guildId: string;
  discordUserId: string;
  onSuccess: (tournamentId: string) => void;
  onCancel: () => void;
}

export function CreateTournamentForm({
  guildId,
  discordUserId,
  onSuccess,
  onCancel,
}: CreateTournamentFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    max_teams: "32",
    teams_per_group: "4",
    time_slot: "",
    platform: "",
    starts_at: "",
    rules: "",
    prize_description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Tournament name is required");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-tournaments", {
        body: {
          action: "create-tournament",
          guild_id: guildId,
          discord_user_id: discordUserId,
          tournament: {
            name: formData.name.trim(),
            description: formData.description.trim() || undefined,
            max_teams: parseInt(formData.max_teams),
            teams_per_group: parseInt(formData.teams_per_group),
            time_slot: formData.time_slot || undefined,
            platform: formData.platform || undefined,
            starts_at: formData.starts_at || undefined,
            rules: formData.rules.trim() || undefined,
            prize_description: formData.prize_description.trim() || undefined,
          },
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed to create tournament");
      }

      toast.success("Tournament created!");
      onSuccess(data.tournament.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to create tournament");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Create New Tournament
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Tournament Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Winter Cup 2026"
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the tournament..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_teams">Max Teams</Label>
              <Select
                value={formData.max_teams}
                onValueChange={(v) => setFormData({ ...formData, max_teams: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8 teams</SelectItem>
                  <SelectItem value="12">12 teams</SelectItem>
                  <SelectItem value="16">16 teams</SelectItem>
                  <SelectItem value="24">24 teams</SelectItem>
                  <SelectItem value="32">32 teams</SelectItem>
                  <SelectItem value="48">48 teams</SelectItem>
                  <SelectItem value="64">64 teams</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="teams_per_group">Teams per Group</Label>
              <Select
                value={formData.teams_per_group}
                onValueChange={(v) => setFormData({ ...formData, teams_per_group: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 teams</SelectItem>
                  <SelectItem value="4">4 teams</SelectItem>
                  <SelectItem value="5">5 teams</SelectItem>
                  <SelectItem value="6">6 teams</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time_slot">Time Slot</Label>
              <Select
                value={formData.time_slot}
                onValueChange={(v) => setFormData({ ...formData, time_slot: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select time slot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="early_bird">🌅 Early Bird (6am-12pm)</SelectItem>
                  <SelectItem value="daytime">☀️ Daytime (12pm-6pm)</SelectItem>
                  <SelectItem value="prime_time">🌙 Prime Time (6pm-12am)</SelectItem>
                  <SelectItem value="after_hours">🌃 After Hours (12am-6am)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform">Platform</Label>
              <Select
                value={formData.platform}
                onValueChange={(v) => setFormData({ ...formData, platform: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cross-platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Cross-platform</SelectItem>
                  <SelectItem value="ps">PlayStation</SelectItem>
                  <SelectItem value="xbox">Xbox</SelectItem>
                  <SelectItem value="pc">PC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="starts_at">Start Date</Label>
              <Input
                id="starts_at"
                type="datetime-local"
                value={formData.starts_at}
                onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="rules">Rules</Label>
              <Textarea
                id="rules"
                value={formData.rules}
                onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                placeholder="Tournament rules and regulations..."
                rows={3}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="prize">Prize Description</Label>
              <Textarea
                id="prize"
                value={formData.prize_description}
                onChange={(e) => setFormData({ ...formData, prize_description: e.target.value })}
                placeholder="What's at stake? Bragging rights, prizes, etc."
                rows={2}
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Tournament
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
