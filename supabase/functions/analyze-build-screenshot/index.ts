import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BuildData {
  position: string;
  height_cm: number | null;
  weight_kg: number | null;
  playstyles: string[];
  playstyles_plus: string[];
  build_rating: number | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { guild_id, discord_user_id, image_base64, image_url } = await req.json();

    if (!guild_id || !discord_user_id) {
      return new Response(JSON.stringify({ error: 'Missing guild_id or discord_user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!image_base64 && !image_url) {
      return new Response(JSON.stringify({ error: 'Missing image_base64 or image_url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[analyze-build] Analyzing build screenshot for ${discord_user_id} in guild ${guild_id}`);

    // Build the image content for the AI
    const imageContent = image_base64 
      ? { type: 'image_url', image_url: { url: image_base64.startsWith('data:') ? image_base64 : `data:image/png;base64,${image_base64}` } }
      : { type: 'image_url', image_url: { url: image_url } };

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert at analyzing EA FC Pro Clubs player build screenshots. Extract the following information from the screenshot:

1. Position (e.g., ST, CAM, CM, CDM, CB, LB, RB, LW, RW, GK)
2. Height in cm (e.g., 180)
3. Weight in kg (e.g., 75)
4. Playstyles (list of regular playstyles like "First Touch", "Power Shot", "Technical", etc.)
5. Playstyles+ (list of enhanced playstyles, indicated with a + symbol)
6. Overall build rating if visible

Respond ONLY with a JSON object in this exact format:
{
  "position": "ST",
  "height_cm": 185,
  "weight_kg": 80,
  "playstyles": ["First Touch", "Power Shot"],
  "playstyles_plus": ["Finesse Shot+"],
  "build_rating": 88
}

If any field is not visible or cannot be determined, use null for numbers and empty arrays for lists.
Do not include any other text, just the JSON object.`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Please analyze this EA FC Pro Clubs player build screenshot and extract the build information.' },
              imageContent
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[analyze-build] AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('[analyze-build] AI response:', aiContent);

    // Parse the JSON from the AI response
    let buildData: BuildData;
    try {
      // Clean the response - remove markdown code blocks if present
      let jsonStr = aiContent.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();
      
      buildData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[analyze-build] Failed to parse AI response:', parseError);
      return new Response(JSON.stringify({ 
        error: 'Failed to extract build data from screenshot. Please ensure the image shows your build clearly.',
        raw_response: aiContent
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate and normalize the data
    const normalizedData: BuildData = {
      position: (buildData.position || '').toUpperCase(),
      height_cm: typeof buildData.height_cm === 'number' ? buildData.height_cm : null,
      weight_kg: typeof buildData.weight_kg === 'number' ? buildData.weight_kg : null,
      playstyles: Array.isArray(buildData.playstyles) ? buildData.playstyles : [],
      playstyles_plus: Array.isArray(buildData.playstyles_plus) ? buildData.playstyles_plus : [],
      build_rating: typeof buildData.build_rating === 'number' ? buildData.build_rating : null,
    };

    // Save to database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: existingBuild } = await supabase
      .from('player_build_profiles')
      .select('id')
      .eq('guild_id', guild_id)
      .eq('discord_user_id', discord_user_id)
      .eq('position', normalizedData.position)
      .maybeSingle();

    if (existingBuild) {
      await supabase
        .from('player_build_profiles')
        .update({
          ...normalizedData,
          screenshot_url: image_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingBuild.id);
    } else {
      await supabase
        .from('player_build_profiles')
        .insert({
          guild_id,
          discord_user_id,
          ...normalizedData,
          screenshot_url: image_url || null,
        });
    }

    console.log(`[analyze-build] Saved build profile for ${discord_user_id}: ${normalizedData.position}`);

    return new Response(JSON.stringify({
      success: true,
      build_data: normalizedData,
      message: `Build profile saved for position ${normalizedData.position}`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[analyze-build] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
