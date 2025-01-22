from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from random import uniform
from fastapi.middleware.cors import CORSMiddleware

# Initialize FastAPI app
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://polaris-phi-seven.vercel.app"],  # Allow frontend to access the backend
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Create a Pydantic model for our data
class Item(BaseModel):
    id: int
    name: str
    price: float
    description: Optional[str] = None

# database connection
item1 = Item(id=1, name="Sample Item 1", price=19.99, description="First sample item")
item2 = Item(id=2, name="Sample Item 2", price=29.99)

items = {1: item1, 2: item2}

@app.get("/get/")
async def get():
    points = 4
    coordinates = [[]]
    
    for _ in range(points):
        coordinates[0].append([
            round(uniform(51.492, 51.509), 6),
            round(uniform(25.280, 25.300), 6)
        ])
    
    # Close the polygon by adding the first point again
    coordinates[0].append(coordinates[0][0])
    
    print({"id": "test", "coordinates": coordinates})
    
    return {"id": "test", "coordinates": coordinates}
