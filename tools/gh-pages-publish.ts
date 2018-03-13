const {cd, exec, echo, touch, mkdir} = require("shelljs")
const {readFileSync} = require("fs")
const url = require("url")

let repoUrl
let pkg = JSON.parse(readFileSync("package.json") as any)
if (typeof pkg.repository === "object") {
  if (!pkg.repository.hasOwnProperty("url")) {
    throw new Error("URL does not exist in repository section")
  }
  repoUrl = pkg.repository.url
} else {
  repoUrl = pkg.repository
}

let parsedUrl = url.parse(repoUrl)
let repository = (parsedUrl.host || "") + (parsedUrl.path || "")
let ghToken = process.env.GH_TOKEN

echo("Deploying gh-page!!!")
mkdir("out")
cd("out")
// touch(".nojekyll")
exec("cp ../README.md README.md")
exec("cp ../_config.yml _config.yml")
exec("cp ../docs docs -r")
exec("cp ../example example -r")
exec("git init")
exec("git add .")
exec('git config user.name "Rayan Salhab"')
exec('git config user.email "rayansalhab@hotmail.com"')
exec('git commit -m "docs(docs): update gh-pages"')
exec(
  `git push --force --quiet "https://${ghToken}@${repository}" master:gh-pages`
)
echo("Docs deployed!!")
