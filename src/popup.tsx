import { useState } from "react"
import "./styles/globals.css"
import { Button } from "./components/ui/button"

function IndexPopup() {
  const [data, setData] = useState("")

  return (
    <div className="p-4 text-center bg-blue-500 text-white rounded-lg shadow-md">
      Hello from Tailwind!
      <Button>Let's go</Button>
    </div>
    // <div
    //   style={{
    //     display: "flex",
    //     flexDirection: "column",
    //     padding: 16,
    //     width:400,
    //   }}>
    //   <h1>
    //     Welcome to your <a href="https://www.plasmo.com">Plasmo</a> Extension!
    //   </h1>
    //   <input onChange={(e) => setData(e.target.value)} value={data} />
    //   <footer>Crafted by @PlasmoHQ</footer>
    // </div>
  )
}

export default IndexPopup
