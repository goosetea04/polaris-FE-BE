import os
import pandas as pd
import json
from dotenv import load_dotenv
import tabulate
from newsapi import NewsApiClient
import requests
from langchain_core.output_parsers import JsonOutputParser
from langchain.prompts import PromptTemplate

"""
Older imports are commented out.

If using older versions of langchain, please update using:
    pip install -U langchain langchain-community langchain-openai pydantic
"""
# from langchain.llms import openai
# from langchain.chat_models import ChatOpenAI
# from langchain.callbacks import get_openai_callback
# from langchain_core.pydantic_v1 import BaseModel, Field
from langchain_community.llms import OpenAI
from langchain_openai import ChatOpenAI
from langchain_community.callbacks.manager import get_openai_callback
from pydantic.v1 import BaseModel, Field

from fastapi import FastAPI
from fastapi import BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import osmnx as ox
import time
from contextlib import asynccontextmanager
import numpy
from geopy.geocoders import Nominatim
import geopandas as gpd

load_dotenv()

class updated_data():
    polygons = {}
    ai_rec = {}
    __model = ChatOpenAI(
        model_name = "gpt-4o-mini",
        temperature = 0.2,
        max_tokens = 16384,
        openai_api_key = os.getenv("OPENAI_API_KEY")
    )
    stop = True
    running = False
    active = False

    # KEYS AND ENV VARS
    LANGSMITH_ENDPOINT = os.getenv("LANGSMITH_ENDPOINT")
    LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY")
    LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT")
    
    @classmethod
    def set_poly(cls, poly_):
        """
        Store .geojson polygons object as string var
        """
        cls.polygons = poly_

    @classmethod
    def set_ai_rec(cls, ai_):
        """
        Store .json ai_rec object as string var
        """
        cls.ai_rec = ai_

    @classmethod
    def set_stop(cls, stop):
        """
        Stop server from running
        """
        cls.stop = stop

    @classmethod
    def set_running(cls, state):
        """
        If began running server: True
        else: False
        """
        cls.running = state

    @classmethod
    def set_active(cls, state):
        """
        If outputs available: True
        else: False
        """
        cls.active = state

    @classmethod
    def start_serverside(cls):
        """
        Perform server side calculations until stopped
        Outputs: 
            cls.polygons : .geojson of Polygons variable
            cls.ai_rec : .json of AI recommendations variable
        """

        cls.set_stop(False)
        cls.set_running(True)

        while(True):
            dt_ = list(cls.get_data())

            # params: md_twitter, dummy_government_data, data (NewsAPI)
            outs_ = list(cls.prompt_ai(cls.__get_model(), dt_[0], dt_[1], dt_[2]))

            # params: o_df, o_twit_df, dummy_government_data, output_recs
            gnd_ = list(cls.gen_polygons(outs_[0], outs_[1], dt_[1], outs_[2]))

            cls.set_ai_rec(gnd_[0])
            cls.set_poly(gnd_[1])

            cls.set_active(True)

            if cls.stop: break

            if not cls.stop: time.sleep(45)
        print("\n\tServer successfully stopped.\n")

    @classmethod
    def stop_serverside(cls):
        cls.set_running(False)
        cls.set_active(False)
        cls.set_stop(True)

    @classmethod
    def get_polygons(cls):
        """
        Outputs:
            cls.polygons : List of polygon dangerzones in the form of geojson string
        """
        return cls.polygons

    @classmethod
    def get_ai_rec(cls):
        """
        Outputs:
            cls.ai_rec : AI recommendations in the form of string
        """
        return cls.ai_rec

    @classmethod
    def get_running(cls):
        return cls.running

    @classmethod
    def get_active(cls):
        return cls.active

    @classmethod
    def __get_model(cls):
        """
        Output:
            cls.model : the AI model
        """
        return cls.__model

    @classmethod
    def get_data(cls):
        """
        Get the data from news, government and twitter sources
        Outputs:
            md_twitter : twitter data in Markdown format
            dummy_government_addys : government identified dangerzone locations
            data : newsAPI identified dangerzones
        """
        # GET DANGER ZONE LOCATION + DUMMY DATA
        url_endpoint = "https://newsapi.org/v2/everything"
        params = {
            "q": "bushfire AND today",
            "domains": "environment.gov.au,theconversation.com/au,australiangeographic.com.au,climate.gov,skynews.com.au,theaustralian.com.au,9news.com.au,bbc.co.uk/weather,theage.com.au,bom.gov.au,abc.net.au,news.com.au,smh.com.au",
            "apiKey": os.getenv('NEWS_API_KEY')
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

        return (md_twitter, dummy_government_addys, data)

    @classmethod
    def prompt_ai(cls, model, md_twitter, dummy_government_addys, data):
        """
        Prompts the AI model 
        Outputs:
            o_df : AI analysis of NewsAPI dangerzone information
            o_twit_df : AI analysis of Twitter dangerzone information
            output_rec : AI recommendations for disaster
        """
        # TEMPLATES
        parser_data_agent = JsonOutputParser(pydantic_object=tds_data_agent)
        parser_twit_agent = JsonOutputParser(pydantic_object=tds_twit_agent)
        parser_rec_agent = JsonOutputParser(pydantic_object=tds_rec_agent)
        tmplt_rec_agent = """
        ---
        You are an advanced information extraction assistant specializing in analyzing articles about natural disasters. Your task is to extract specific data fields from the provided JSON article and structure them into the `tds_data_agent` schema. Carefully follow the instructions and requirements below to ensure accuracy and completeness.

        Use the following format instructions:
        {format_instructions}
        ---

        ### INPUT FORMAT  
        You will receive an article in JSON format with the following fields:  

        - `twitter insight` : is a bunch of twitter posts stored in Markdown format : {twitter_insight}

        ---

        ### TASK INSTRUCTIONS 

        1. **Analyze for Disaster Context**:  
        Each field in the `OUTPUT FORMAT` must correspond to the type of natural disaster(s) described in the `twitter_insight` content. Look for:
        - The type of disaster (e.g., flood, wildfire, earthquake, hurricane).
        - How the disaster affects mobility, clothing needs, and general survival recommendations.

        2. **Field-Specific Extraction Guidance**:
        - **Vehicle Advice**:  
            Assess the disaster context and identify the most suitable type of land vehicle for navigation or evacuation (e.g., 4-Wheeler large vehicles for floods, container trucks for large-scale evacuation, small vehicles for tight or debris-filled spaces, or motorbikes for areas with limited road access).  
            Include only practical suggestions that match the disaster conditions.

        - **Clothing Advice**:  
            Extract clothing recommendations based on the environmental conditions created by the disaster. Examples include:
            - Warm clothes for cold-weather disasters (e.g., blizzards).
            - Fireproof clothes for wildfires.
            - Waterproof clothes for floods or heavy rains.  
            Prioritize functional and protective clothing relevant to survival in the described disaster.

        - **General Advice**:  
            Provide concise and practical recommendations addressing the unpredictability, speed, or severity of the disaster. For instance:
            - Alerting users about sudden changes (e.g., rapidly spreading wildfires).
            - Highlighting life-threatening risks (e.g., flash floods).
            - Advising on preparedness for specific outcomes (e.g., power outages, supply shortages).  
            This should be no more than **2 sentences** to maintain clarity and focus.

        ---

        ### OUTPUT FORMAT TEMPLATE  

        {{
            "vehicle_advice": "{{Type of land vehicle recommendation according to disaster described (e.g., 4-Wheeler large vehicle, 4-Wheeler container trucks, small vehicles, motorbikes)}}",
            "clothing_advice": "{{General clothing advice according to disaster described (e.g., Warm clothes, Fire-proof clothes, Water-proof clothes)}}",
            "general_advice": "{{General advice for users to take into account regarding the disaster. How unpredictable the disaster is, potential for loss of life, how fast the disaster spreads, etc. *No more than 2 sentences*}}",
        }}

        ---

        By following these instructions, you will accurately extract all necessary information for the `tds_rec_agent` schema and provide high-quality, structured data.
        """

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

        By following these instructions, you will accurately extract all necessary information for the `tds_rec_agent` schema and provide high-quality, structured data.
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

                # Max of 5 articles (for MVP - token usage limiting)
                if num_articles > 5:
                    break
            
            # Analyze twitter and ensure correlation with Government insight
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

            # OUTPUTS TO DF
            o_df = pd.DataFrame(outputs)
            o_twit_df = pd.DataFrame(output_twit)

            prompt_rec_agent = PromptTemplate(
                    template=tmplt_rec_agent,
                    input_variables=[],
                    partial_variables={
                        "format_instructions" : parser_rec_agent.get_format_instructions(),
                        "twitter_insight" : o_twit_df.to_markdown(),
                        "news_insight" : o_df.to_markdown()
                    }
                )
            
            chain_rec_agent = prompt_rec_agent | model | parser_rec_agent
            output_rec = chain_rec_agent.invoke({})

            print(cb)


        return (o_df, o_twit_df, output_rec)

    @classmethod
    def gen_polygons(cls, o_df, o_twit_df, dummy_government_addys, output_rec):
        """
        Generate list of polygons and ai recommendation as geojson and json file
        Outputs:
            ai_advice : AI advice in formatted JSON
            polygons_json : Dangerzones in Polygon formatted GeoJSON
        """
        # CREATE .geojson
        polygons_dict = {
            "twitter" : [],
            "gov" : [],
            "news" : []
        }

        for addy in o_df['location']:
            try:
                polygon = ox.geocode_to_gdf(addy)
                polygons_dict['news'].append(polygon)
            except:
                continue

        for addy in o_twit_df['location']:
            try:
                polygon = ox.geocode_to_gdf(addy)
                polygons_dict['twitter'].append(polygon)
            except:
                continue

        for addy in dummy_government_addys:
            try:
                polygon = ox.geocode_to_gdf(addy)
                polygons_dict['gov'].append(polygon)
            except:
                continue

        # Save the polygon as a GeoJSON file
        for i in range(3):
            polygons_gdf = gpd.GeoDataFrame(pd.concat(polygons_dict['gov'], ignore_index=True))

        polygons_gdf.to_file("polygons.geojson", driver="GeoJSON")
        polygons_gjson = polygons_gdf.to_json()

        ai_advice = json.dumps(output_rec, indent=4)

        return (ai_advice, polygons_gjson)

    @classmethod
    def __del__(self):
        """
        Cleanup method called when an instance is deleted
        """

        # Reset shared resources
        self.polygons.clear()
        self.ai_rec.clear()
        
        # Explicitly delete model (if necessary)
        if hasattr(self, "__model"):
            del self.__model

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

class tds_rec_agent(BaseModel):
    vehicle_advice : str = Field(description="")
    clothing_advice : str = Field(description="")
    general_advice : str = Field(description="")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Run serverside on startup of server, when server is closed, stop serverside and delete object
    """
    global zones
    zones = updated_data()
    yield
    zones.stop_serverside()

# uvicorn first_responders_serverside_backend:app --reload
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware
)

@app.post("/dangerzones")
async def getPolygons():
    """
    Returns a JSON of polygons as dangerzones based on a given identified disaster.
    """
    if (zones.get_running() & zones.get_active()):
        return JSONResponse(content=zones.get_polygons())
    elif (zones.get_running() & (not zones.get_active())):
        return JSONResponse(content={"message": "Please wait: Serverside running. . ."})
    else:
        return JSONResponse(content={"message": "Please run: start_serverside()"})

@app.post("/ai_advice")
async def getAIAdvice():
    """
    Returns a JSON of AI Recommendations based on a given identified disaster.
    """
    if (zones.get_running() & zones.get_active()):
        return JSONResponse(content=zones.get_ai_rec())
    elif (zones.get_running() & (not zones.get_active())):
        return JSONResponse(content={"message": "Please wait: Serverside running. . ."})
    else:
        return JSONResponse(content={"message": "Please run: start_serverside()"})

@app.post("/start_serverside")
async def start_serverside(background_tasks: BackgroundTasks):
    """
    Start the serverside processing in the background on request.
    This is triggered by a POST request.
    """
    if zones.get_running():
        return JSONResponse(content={"message": "Serverside already running."})

    background_tasks.add_task(zones.start_serverside)
    return JSONResponse(content={"message": "Serverside started successfully."})

@app.post("/stop_serverside")
async def stop_serverside():
    """
    Stop the serverside processing.
    """
    if zones.get_running():
        zones.stop_serverside()
        return JSONResponse(content={"message": "Serverside stopped successfully."})

    return JSONResponse(content={"message": "Serverside is not running."})
