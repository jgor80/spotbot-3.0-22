import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Star, 
  Loader2, 
  Target, 
  Shield, 
  Goal,
  Crosshair,
  Footprints,
  Zap,
  Lightbulb,
  PersonStanding,
  Swords,
  MapPin,
  Users,
  ArrowUp,
  Dumbbell,
  Eye,
  Hand,
  Move,
  UserCheck,
  Crown
} from "lucide-react";

interface Player {
  discord_user_id: string;
  discord_username: string | null;
  ea_username: string | null;
  overall_rating: number;
  primary_position?: string | null;
}

interface ManagerEvaluationFormProps {
  guildId: string;
  evaluatorId: string;
  players: Player[];
}

const POSITIONS = [
  { value: "GK", label: "Goalkeeper", type: "gk" },
  { value: "CB", label: "Center Back", type: "def" },
  { value: "LB", label: "Left Back", type: "def" },
  { value: "RB", label: "Right Back", type: "def" },
  { value: "LWB", label: "Left Wing Back", type: "def" },
  { value: "RWB", label: "Right Wing Back", type: "def" },
  { value: "CDM", label: "Defensive Mid", type: "mid" },
  { value: "CM", label: "Center Mid", type: "mid" },
  { value: "CAM", label: "Attacking Mid", type: "mid" },
  { value: "LM", label: "Left Mid", type: "mid" },
  { value: "RM", label: "Right Mid", type: "mid" },
  { value: "LW", label: "Left Wing", type: "att" },
  { value: "RW", label: "Right Wing", type: "att" },
  { value: "CF", label: "Center Forward", type: "att" },
  { value: "ST", label: "Striker", type: "att" },
];

function getPositionType(pos: string): "gk" | "def" | "mid" | "att" {
  const position = POSITIONS.find(p => p.value === pos);
  return (position?.type as "gk" | "def" | "mid" | "att") || "att";
}

interface RatingSliderProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  icon: React.ReactNode;
  description?: string;
}

function RatingSlider({ label, value, onChange, icon, description }: RatingSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <Label className="text-sm font-medium">{label}</Label>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              className="p-0.5 hover:scale-110 transition-transform"
            >
              <Star
                className={`h-5 w-5 transition-colors ${
                  star <= value 
                    ? "fill-yellow-400 text-yellow-400" 
                    : "text-muted-foreground/30"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function ManagerEvaluationForm({ guildId, evaluatorId, players }: ManagerEvaluationFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [position, setPosition] = useState("");
  const [notes, setNotes] = useState("");
  
  // Overall
  const [overallPerformance, setOverallPerformance] = useState(3);
  
  // Offensive ratings
  const [shooting, setShooting] = useState(3);
  const [passing, setPassing] = useState(3);
  const [dribbling, setDribbling] = useState(3);
  const [pace, setPace] = useState(3);
  const [creativity, setCreativity] = useState(3);
  const [offBallMovement, setOffBallMovement] = useState(3);
  
  // Defensive ratings
  const [tackling, setTackling] = useState(3);
  const [defensivePositioning, setDefensivePositioning] = useState(3);
  const [marking, setMarking] = useState(3);
  const [aerialAbility, setAerialAbility] = useState(3);
  const [strength, setStrength] = useState(3);
  const [defensiveAwareness, setDefensiveAwareness] = useState(3);
  
  // GK ratings
  const [shotStopping, setShotStopping] = useState(3);
  const [gkPositioning, setGkPositioning] = useState(3);
  const [handling, setHandling] = useState(3);
  const [distribution, setDistribution] = useState(3);
  const [commandOfArea, setCommandOfArea] = useState(3);
  const [oneOnOnes, setOneOnOnes] = useState(3);

  const positionType = position ? getPositionType(position) : null;
  const selectedPlayerData = players.find(p => p.discord_user_id === selectedPlayer);

  const handleSubmit = async () => {
    if (!selectedPlayer || !position) {
      toast({
        title: "Missing Information",
        description: "Please select a player and position",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        guild_id: guildId,
        evaluator_discord_id: evaluatorId,
        evaluated_discord_id: selectedPlayer,
        position_played: position,
        overall_performance: overallPerformance,
        notes: notes || undefined,
      };

      // Add position-specific ratings
      if (positionType === "gk") {
        payload.shot_stopping = shotStopping;
        payload.gk_positioning = gkPositioning;
        payload.handling = handling;
        payload.distribution = distribution;
        payload.command_of_area = commandOfArea;
        payload.one_on_ones = oneOnOnes;
      } else {
        // Add offensive ratings for non-GK
        if (positionType === "att" || positionType === "mid") {
          payload.shooting = shooting;
          payload.passing = passing;
          payload.dribbling = dribbling;
          payload.pace = pace;
          payload.creativity = creativity;
          payload.off_ball_movement = offBallMovement;
        }
        
        // Add defensive ratings for defenders and midfielders
        if (positionType === "def" || positionType === "mid") {
          payload.tackling = tackling;
          payload.defensive_positioning = defensivePositioning;
          payload.marking = marking;
          payload.aerial_ability = aerialAbility;
          payload.strength = strength;
          payload.defensive_awareness = defensiveAwareness;
        }
        
        // Attackers get some defensive contribution too
        if (positionType === "att") {
          payload.tackling = tackling;
          payload.defensive_positioning = defensivePositioning;
          payload.marking = marking;
        }
        
        // Defenders get some offensive contribution
        if (positionType === "def") {
          payload.passing = passing;
          payload.pace = pace;
          payload.aerial_ability = aerialAbility;
        }
      }

      const { data, error } = await supabase.functions.invoke("submit-manager-evaluation", {
        body: payload,
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: "Evaluation Submitted",
        description: `Performance rating saved for ${selectedPlayerData?.discord_username || selectedPlayer}`,
      });

      // Reset form
      setSelectedPlayer("");
      setPosition("");
      setNotes("");
      setOverallPerformance(3);
      setShooting(3);
      setPassing(3);
      setDribbling(3);
      setPace(3);
      setCreativity(3);
      setOffBallMovement(3);
      setTackling(3);
      setDefensivePositioning(3);
      setMarking(3);
      setAerialAbility(3);
      setStrength(3);
      setDefensiveAwareness(3);
      setShotStopping(3);
      setGkPositioning(3);
      setHandling(3);
      setDistribution(3);
      setCommandOfArea(3);
      setOneOnOnes(3);
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-lg">Captain's Performance Rating</CardTitle>
        </div>
        <CardDescription>
          Rate player performance with detailed position-specific categories. Your evaluations directly impact player ratings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Player & Position Selection */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Select Player</Label>
            <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a player..." />
              </SelectTrigger>
              <SelectContent>
                {players.map(p => (
                  <SelectItem key={p.discord_user_id} value={p.discord_user_id}>
                    <span className="flex items-center gap-2">
                      {p.discord_username || p.ea_username || p.discord_user_id}
                      <Badge variant="secondary" className="text-xs">
                        {p.overall_rating.toFixed(0)}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Position Played</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger>
                <SelectValue placeholder="Select position..." />
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label} ({p.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Overall Performance */}
        {selectedPlayer && position && (
          <>
            <div className="p-4 border rounded-lg bg-muted/30">
              <RatingSlider
                label="Overall Performance"
                value={overallPerformance}
                onChange={setOverallPerformance}
                icon={<Star className="h-5 w-5 text-yellow-500" />}
                description="Overall match performance rating"
              />
            </div>

            {/* Position-Specific Ratings */}
            {positionType === "gk" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Hand className="h-5 w-5 text-green-500" />
                  <h4 className="font-semibold">Goalkeeper Ratings</h4>
                </div>
                <div className="grid gap-4 p-4 border rounded-lg">
                  <RatingSlider label="Shot Stopping" value={shotStopping} onChange={setShotStopping} icon={<Goal className="h-4 w-4 text-red-500" />} description="Saving shots, reflexes" />
                  <RatingSlider label="Positioning" value={gkPositioning} onChange={setGkPositioning} icon={<MapPin className="h-4 w-4 text-blue-500" />} description="Cutting angles, placement" />
                  <RatingSlider label="Handling" value={handling} onChange={setHandling} icon={<Hand className="h-4 w-4 text-green-500" />} description="Catching, parrying, punching" />
                  <RatingSlider label="Distribution" value={distribution} onChange={setDistribution} icon={<Footprints className="h-4 w-4 text-purple-500" />} description="Kicking, throwing, building from back" />
                  <RatingSlider label="Command of Area" value={commandOfArea} onChange={setCommandOfArea} icon={<Crown className="h-4 w-4 text-amber-500" />} description="Claiming crosses, sweeping" />
                  <RatingSlider label="1v1 Ability" value={oneOnOnes} onChange={setOneOnOnes} icon={<UserCheck className="h-4 w-4 text-cyan-500" />} description="Facing breakaways, spreading" />
                </div>
              </div>
            )}

            {(positionType === "att" || positionType === "mid") && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-orange-500" />
                  <h4 className="font-semibold">Offensive Ratings</h4>
                </div>
                <div className="grid gap-4 p-4 border rounded-lg">
                  <RatingSlider label="Shooting" value={shooting} onChange={setShooting} icon={<Crosshair className="h-4 w-4 text-red-500" />} description="Finishing, shot power, accuracy" />
                  <RatingSlider label="Passing" value={passing} onChange={setPassing} icon={<Move className="h-4 w-4 text-blue-500" />} description="Short/long passing, vision, through balls" />
                  <RatingSlider label="Dribbling" value={dribbling} onChange={setDribbling} icon={<Footprints className="h-4 w-4 text-green-500" />} description="Ball control, skill moves" />
                  <RatingSlider label="Pace" value={pace} onChange={setPace} icon={<Zap className="h-4 w-4 text-yellow-500" />} description="Sprint speed, acceleration" />
                  <RatingSlider label="Creativity" value={creativity} onChange={setCreativity} icon={<Lightbulb className="h-4 w-4 text-purple-500" />} description="Creating chances, unpredictability" />
                  <RatingSlider label="Off-Ball Movement" value={offBallMovement} onChange={setOffBallMovement} icon={<PersonStanding className="h-4 w-4 text-cyan-500" />} description="Making runs, positioning" />
                </div>
              </div>
            )}

            {(positionType === "def" || positionType === "mid" || positionType === "att") && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-500" />
                  <h4 className="font-semibold">Defensive Ratings</h4>
                  {positionType === "att" && <Badge variant="outline" className="text-xs">Contribution only</Badge>}
                </div>
                <div className="grid gap-4 p-4 border rounded-lg">
                  <RatingSlider label="Tackling" value={tackling} onChange={setTackling} icon={<Swords className="h-4 w-4 text-red-500" />} description="Standing/slide tackles, timing" />
                  <RatingSlider label="Positioning" value={defensivePositioning} onChange={setDefensivePositioning} icon={<MapPin className="h-4 w-4 text-blue-500" />} description="Reading the game, interceptions" />
                  <RatingSlider label="Marking" value={marking} onChange={setMarking} icon={<Users className="h-4 w-4 text-green-500" />} description="Man marking, tracking runners" />
                  {(positionType === "def" || positionType === "mid") && (
                    <>
                      <RatingSlider label="Aerial Ability" value={aerialAbility} onChange={setAerialAbility} icon={<ArrowUp className="h-4 w-4 text-purple-500" />} description="Heading, winning aerial duels" />
                      <RatingSlider label="Strength" value={strength} onChange={setStrength} icon={<Dumbbell className="h-4 w-4 text-amber-500" />} description="Physical battles, holding off players" />
                      <RatingSlider label="Defensive Awareness" value={defensiveAwareness} onChange={setDefensiveAwareness} icon={<Eye className="h-4 w-4 text-cyan-500" />} description="Anticipation, covering spaces" />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Any specific feedback or observations..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Submit Button */}
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting || !selectedPlayer || !position}
              className="w-full gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Star className="h-4 w-4" />
              )}
              Submit Performance Rating
            </Button>
          </>
        )}

        {(!selectedPlayer || !position) && (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a player and position to begin rating</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
