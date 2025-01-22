import sys, os
import pandas as pd
from bs4 import BeautifulSoup as bs
from newsapi import NewsApiClient
import requests
from langchain.llms import openai
from langchain.chat_models import ChatOpenAI
from langchain_core.pydantic_v1 import BaseModel, Field
from langchain_core.output_parsers import JsonOutputParser
from langchain.callbacks import get_openai_callback
from langchain.prompts import PromptTemplate
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import osmnx as ox
from geopy.geocoders import Nominatim
import geopandas as gpd

from dotenv import load_dotenv

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
)

# TEMPLATE CLASSES
class tds_data_agent(BaseModel):
    title : str = Field(description="")
    location : str = Field(description="")
    disaster_type : str = Field(description="")
    emergency_no : str = Field(description="")
    url : str = Field(description="")
    danger_level : str = Field(description="")
    summary : str = Field(description="")

class tds_twit_agent(BaseModel):
    location : str = Field(description="")
    status : str = Field(description="")

# TEMPLATES
parser_data_agent = JsonOutputParser(pydantic_object=tds_data_agent)
parser_twit_agent = JsonOutputParser(pydantic_object=tds_twit_agent)

tmplt_data_agent = """
---
You are an advanced information extraction assistant specializing in analyzing articles about natural disasters. Your task is to extract specific data fields from the provided JSON article and structure them into the `tds_data_agent` schema. Carefully follow the instructions and requirements below to ensure accuracy and completeness.

Use the following format instructions:
{format_instructions}
---

### INPUT FORMAT  
You will receive an article in JSON format with the following fields:  

- `title`: The headline or title of the article : {article_title} 
- `content`: The full text content of the article (this is typically large). : {article_content}

---

### TASK INSTRUCTIONS  

Using the provided JSON article, extract the following fields and map them to the `tds_data_agent` schema:  

#### 1. **Title**  
   - Use the `title` field from the JSON input directly for the `title` field of `tds_data_agent`.  

#### 2. **Location**  
   - Identify the **specific address or precise location** where the disaster is occurring. Ensure the output provides a complete and unambiguous location.
   - Format the location as:  
     ```
     "[Street Address or Landmark (if applicable)], [Specific Area or Suburb], [City], [State/Territory], [Country]"
     ```
   - Avoid vague descriptions such as "Mid West, Western Australia, Australia" unless absolutely no further details are available.
   - Use information in the `content` to derive the most specific location possible. If the article provides ambiguous or conflicting locations, choose the one most prominently associated with the disaster.
   - Return the location as a **string** in the `location` field.  
   - Identify the main address or region of a disaster. Ensure to identify a specific region.
   - output must be in the format: "[Specific Address (if applicable)], [Area], [City], [State], [Country]"
   - Return the identified locations as a **string** in the `location` field.  
   - ***Useful tip:*** All regions are in Country = Australia

#### 3. **Disaster Type**  
   - Determine the type of natural disaster being discussed in the article based on the `content`.  
   - Common examples include:  
     - Flood  
     - Earthquake  
     - Hurricane  
     - Wildfire  
     - Tornado  
     - Landslide  
   - Use lowercase strings (e.g., "flood", "earthquake") for the `disaster_type` field.  

#### 4. **Emergency Number**  
   - Check the `content` for any emergency contact numbers explicitly mentioned in the article (e.g., helpline numbers).  
   - If an emergency number is found, return it in the `emergency_no` field as a string.  
   - If no emergency numbers are found, return an empty string: `""`.  

#### 5. **Danger Level**  
   - Assess the danger level of the natural disaster based on the severity and impact described in the `content`.  
   - Use the following scale to determine the value for the `danger_level` field:  
     - **1**: Safe  
     - **2**: Safe but exercise caution  
     - **3**: Do not go unless necessary  
     - **4**: Dangerous  
     - **5**: Potential for loss of life  

#### 6. **Summary**  
   - Write a concise summary (max **2 sentences**) describing how the natural disaster is developing or performing according to the article.  
   - The summary should capture the most critical details from the article.  
   - Return this as a string in the `summary` field.  

---

### OUTPUT FORMAT TEMPLATE  

{{
    "title": "{{Extracted title from the JSON input}}",
    "location": "{{Location Identified }}",
    "disaster_type": "{{natural disaster type (e.g., bushfire, flood, wildfire)}}",
    "emergency_no": "{{emergency contact number if available, else empty string}}",
    "danger_level": {{integer between 1 and 5 based on the danger scale}},
    "summary": "{{Two-sentence summary of the natural disaster's performance}}"
}}

---

By following these instructions, you will accurately extract all necessary information for the `tds_data_agent` schema and provide high-quality, structured data.
"""

tmplt_twit_agent = """
---
You are an advanced information extraction assistant specializing in analyzing Twitter data to detect discussions about natural disasters in specific government-monitored locations. Your task is to analyze tweets and determine if any locations in the provided `gov_data` are dangerous. The extracted information must be structured into the `gov_twitter_data_agent` schema. Follow the instructions carefully to ensure accurate results.

Use the following format instructions:
{format_instructions}
---

### INPUT FORMAT  
You will receive:  

1. `gov_data`: A list of government-monitored locations formatted as strings:  
{gov_data}

2. `twitter_data`: A list of tweets in Markdown format with the following fields:  
[ {{ "username": "<Twitter username>", "content": "<Tweet content>", "date-time posted": "<ISO 8601 date-time string>" }}, ... ]
{twitter_data}

---

### TASK INSTRUCTIONS  

Using the provided data, analyze the `twitter_data` to determine if any locations in the `gov_data` are marked as dangerous. Follow these steps:

#### 1. **Location Matching**  
- Check the `content` field of each tweet to find mentions of locations that match any entry in the `gov_data`.  
- Matches should be case-insensitive and may include partial matches (e.g., "Churchill National Park" matches "Churchill National Park, Rowville, VIC, Australia").  

#### 2. **Identify Disaster Keywords**  
- Look for keywords in the `content` field indicating a natural disaster, such as:  
  - "fire", "flood", "earthquake", "storm", "hurricane", "cyclone", etc.  

#### 3. **Determine Danger Status**  
- If a tweet mentions a location in `gov_data` and includes disaster-related keywords, mark the location as **dangerous**.  
- If no tweets mention a location or disaster-related keywords are absent, mark the location as **not dangerous**.  

#### 4. **Output Results**  
- Provide a structured output for each location in `gov_data` with the following fields:  
  ```
  {{
      "location_name": "<Location name from gov_data>",
      "status": "<'dangerous' or 'not dangerous'>"
  }}
  ```
"""

# KEYS AND ENV VARS
LANGSMITH_ENDPOINT = "https://api.smith.langchain.com"
LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY")
LANGSMITH_PROJECT = "CMUQ-HACK-25-FR"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
api = NewsApiClient(api_key=os.getenv("NEWS_API_KEY"))

# GET DANGER ZONE LOCATION + DUMMY DATA
url_endpoint = "https://newsapi.org/v2/everything"
params = {
    "q": "bushfire AND today",
    "domains": "environment.gov.au,theconversation.com/au,australiangeographic.com.au,climate.gov,skynews.com.au,theaustralian.com.au,9news.com.au,bbc.co.uk/weather,theage.com.au,bom.gov.au,abc.net.au,news.com.au,smh.com.au",
    "apiKey": os.getenv("NEWS_API_KEY")
}

# Make the request
news_response = requests.get(url_endpoint, params=params)
# Parse and print the response
if news_response.status_code == 200:
    data = news_response.json()
else:
    print(f"Error: {news_response.status_code}, {news_response.text}")

news_response = news_response.json()

dummy_government_addys = [
    "You Yangs Regional Park, Little River, VIC, Australia",
    "Yarra Ranges National Park, VIC, Australia",
    "Plenty Gorge Park, South Morang, VIC, Australia",
    "Churchill National Park, Rowville, VIC, Australia"
]

dummy_twitter_data = [
{
    "username": "BushfireAlertAU",
    "content": "🚨 Major bushfire reported at You Yangs Regional Park. Fire crews are on the scene. Stay safe and avoid the area! #Bushfire #YouYangs",
    "date-time posted": "2025-01-22T14:30:00Z"
},
{
    "username": "LocalExplorer",
    "content": "Driving past Little River and the smoke from You Yangs is intense. Hoping everyone stays safe. 🙏 #VicFires",
    "date-time posted": "2025-01-22T14:45:00Z"
},
{
    "username": "NatureLover95",
    "content": "Sad to hear about the fire in Yarra Ranges National Park. It’s such a beautiful place. #Bushfire",
    "date-time posted": "2025-01-22T14:50:00Z"
},
{
    "username": "FireWatchVIC",
    "content": "UPDATE: Yarra Ranges fire spreading rapidly due to strong winds. Nearby residents advised to evacuate immediately. #YarraRanges",
    "date-time posted": "2025-01-22T15:00:00Z"
},
{
    "username": "HikerJohn",
    "content": "Had to cut my hike short in Plenty Gorge Park. Smoke everywhere, and it’s hard to breathe. Please stay clear! #PlentyGorge #FireWarning",
    "date-time posted": "2025-01-22T15:10:00Z"
},
{
    "username": "EmergencyVIC",
    "content": "Emergency warning issued for South Morang near Plenty Gorge Park. Leave now if in danger. #VicEmergency",
    "date-time posted": "2025-01-22T15:20:00Z"
},
{
    "username": "AnnaTheExplorer",
    "content": "Churchill National Park on fire again. Helicopters overhead trying to control it. 🙁 #Rowville #ChurchillParkFire",
    "date-time posted": "2025-01-22T15:30:00Z"
},
{
    "username": "BushfireUpdates",
    "content": "Residents near Churchill National Park are urged to monitor emergency broadcasts. Conditions worsening. #BushfireVIC",
    "date-time posted": "2025-01-22T15:40:00Z"
},
{
    "username": "CityWeather",
    "content": "Strong winds today are making the fires worse. Avoid outdoor activities if you’re near You Yangs or Yarra Ranges. #BushfireSafety",
    "date-time posted": "2025-01-22T15:45:00Z"
},
{
    "username": "ConcernedParent",
    "content": "Kids are home from school early due to the smoke from the Plenty Gorge fires. Stay safe everyone. #PlentyGorgeFire",
    "date-time posted": "2025-01-22T16:00:00Z"
},
{
    "username": "ForestLover",
    "content": "Devastated to see parts of Yarra Ranges burning. That park is a treasure. Hoping for rain soon. 🌧️ #YarraRanges",
    "date-time posted": "2025-01-22T16:10:00Z"
},
{
    "username": "FireCrewSupporter",
    "content": "Massive respect to the fire crews working tirelessly at Churchill National Park. Heroes! #BushfireHeroes",
    "date-time posted": "2025-01-22T16:15:00Z"
},
{
    "username": "SkyWatcherAU",
    "content": "Thick smoke visible from miles away at You Yangs. Praying for everyone involved. 🙏 #YouYangsFire",
    "date-time posted": "2025-01-22T16:20:00Z"
},
{
    "username": "EmergencyAlerts",
    "content": "Critical fire warnings remain in place for Plenty Gorge and surrounding areas. Please evacuate if instructed. #EmergencyVIC",
    "date-time posted": "2025-01-22T16:25:00Z"
},
{
    "username": "RowvilleResident",
    "content": "Churchill National Park fire spreading fast. We’ve evacuated to a nearby shelter. Stay safe everyone. #Bushfire",
    "date-time posted": "2025-01-22T16:30:00Z"
}
]

df_twitter = pd.DataFrame(dummy_twitter_data)

md_twitter = df_twitter.to_markdown()


# INIT AI MODEL
model = ChatOpenAI(
    model_name = "gpt-4o-mini",
    temperature = 0.2,
    max_tokens = 16384,
    openai_api_key = os.getenv("OPENAI_API_KEY")
)

# AI CALL
num_articles = 0
outputs = []
with get_openai_callback() as cb:
    for article in data.get("articles", []):
        print(f"Reviewing: {num_articles} - {article['title']}")
        prompt = PromptTemplate(
            template=tmplt_data_agent,
            input_variables=[],
            partial_variables={
                "format_instructions" : parser_data_agent.get_format_instructions(),
                "article_title" : article['title'],
                "article_content" : article['content']
            }
        )

        chain = prompt | model | parser_data_agent
        output = chain.invoke({})

        if (output['danger_level'] > 4):
            outputs.append(output)
        num_articles += 1

        if num_articles > 5:
            break
    
    prompt_twitter_agent = PromptTemplate(
            template=tmplt_twit_agent,
            input_variables=[],
            partial_variables={
                "format_instructions" : parser_twit_agent.get_format_instructions(),
                "gov_data" : dummy_government_addys,
                "twitter_data" : md_twitter
            }
        )
    
    chain_twit_agent = prompt_twitter_agent | model | parser_twit_agent
    output_twit = chain_twit_agent.invoke({})
    print(cb)


# OUTPUTS TO DF
o_df = pd.DataFrame(outputs)
o_twit_df = pd.DataFrame(output_twit)


# CREATE .geojson
polygons_dict = {
    "twitter" : [],
    "gov" : [],
    "news" : []
}

for addy in o_df['location']:
    polygon = ox.geocode_to_gdf(addy)
    polygons_dict['news'].append(polygon)

for addy in o_twit_df['location']:
    polygon = ox.geocode_to_gdf(addy)

    # Save the polygon as a GeoJSON file
    polygons_dict['twitter'].append(polygon)

for addy in dummy_government_addys:
    polygon = ox.geocode_to_gdf(addy)

    polygons_dict['gov'].append(polygon)

# Save the polygon as a GeoJSON file
for i in range(3):
    polygons_gdf = gpd.GeoDataFrame(pd.concat(polygons_dict['gov'], ignore_index=True))

polygons_gdf.to_file("polygons.geojson", driver="GeoJSON")