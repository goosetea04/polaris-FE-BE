# Crisis Management App

## Description
**Polaris** is a comprehensive solution designed to aid relief organizations in managing crises, including natural disasters, humanitarian emergencies, and warzones. It provides a map-based interface to monitor supply and evacuation lines. The backend that we have is used to identify geographical challenges, and reroute to safer paths, ensuring efficient and effective disaster response.

The current backend is a 

## Features
- Real-time mapping that updates every 60 seconds and monitoring of supply routes.
- Risk assessment for geographical regions.
- Dynamic rerouting to minimize risks.

## Instructions for Running/Testing the Project

- Run the backend
`cd BE`
`pip install -r requirements.txt`

- The backend is functional at the moment
`cd BE-proto`
`uvicorn test:app --reload`

`Navigate to the frontend to run or follow our deployed link `https://polaris-phi-seven.vercel.app/` to test
`cd FE`
`npm run install`
`npm run dev`
open `https://localhost:3000` to access

The dummy username is "gusti.fatu@gmail.com" and the password is "12341234"


### Prerequisites
1. Ensure you have pip, [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed.
2. Clone this repository to your local machine.

### How to use and test

1. Run the localhost or access the deployed website as mentioned above.
2. run the BE-proto backend on port 8000
3. Log in with the dummy account
3. click on the desired destination
4. click 'navigate'
5. routing should show and this will update based on the danger zones prescribed by the backend every 60 seconds

- There is also a destination input to set destination coordinates to a predefined place
- You will notice there is a bar notifying workers on whether a crisis is ongoing in the immediate area
- You will notice that there are AI suggestions that is geared towards empowering relief workers with suggestions of what actions to take next.
- A tracker of other organizations are also displayed. This is done with the aim of ensuring that relief efforts are well distributed.

## Credits
- **Development Team:** [Gusti Rais, Yousef Yaser, Gama Rais, Omar]
- **Tools and Technologies:**
  - Map services (e.g., Nominatim, OpenStreetMap).
  - Backend framework (e.g., python).
  - Frontend framework (e.g., Next.js, tailwind CSS).

## License
This project is licensed under the [MIT License](LICENSE).