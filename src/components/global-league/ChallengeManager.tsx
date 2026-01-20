import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Inbox, Send, Calendar } from "lucide-react";

export function ChallengeManager() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Match Challenges
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="incoming">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="incoming" className="flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              Incoming
            </TabsTrigger>
            <TabsTrigger value="outgoing" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Outgoing
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Scheduled
            </TabsTrigger>
          </TabsList>

          <TabsContent value="incoming" className="mt-4">
            <div className="text-center py-8 text-muted-foreground">
              <Inbox className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No incoming challenges</p>
              <p className="text-sm mt-1">
                When other clubs challenge you, they'll appear here.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="outgoing" className="mt-4">
            <div className="text-center py-8 text-muted-foreground">
              <Send className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No outgoing challenges</p>
              <p className="text-sm mt-1">
                Use the Discover tab to find and challenge other clubs.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="scheduled" className="mt-4">
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No scheduled matches</p>
              <p className="text-sm mt-1">
                Accepted challenges will appear here as scheduled matches.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 p-4 bg-muted/30 rounded-lg">
          <h4 className="font-medium mb-2">How Challenges Work</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Send a challenge with proposed match times</li>
            <li>• Opponent has 48 hours to accept or decline</li>
            <li>• Once accepted, play a friendly match on EA FC</li>
            <li>• Results are automatically detected and ELO updated</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
